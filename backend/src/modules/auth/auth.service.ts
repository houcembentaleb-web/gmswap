import { Injectable, UnauthorizedException, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { RegisterDto, LoginDto, RefreshTokenDto, ChangePasswordDto, ForgotPasswordDto, ResetPasswordDto } from './dto';
import * as crypto from 'crypto';
import { EventBusService } from '../../infrastructure/event-bus/event-bus.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly bcryptRounds = parseInt(process.env.BCRYPT_ROUNDS || '12');
  private readonly MAX_SESSIONS = 5;

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private redis: RedisService,
    private eventBus: EventBusService,
  ) {}

  // ==========================================
  // REGISTER
  // ==========================================

  async register(dto: RegisterDto, ipAddress?: string, userAgent?: string) {
    // Check existing user
    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: dto.email },
          { username: dto.username },
          ...(dto.phone ? [{ phone: dto.phone }] : []),
        ],
      },
    });

    if (existingUser) {
      throw new ConflictException('User already exists');
    }

    const hashedPassword = await bcrypt.hash(dto.password, this.bcryptRounds);

    const user = await this.prisma.user.create({
      data: {
        username: dto.username,
        email: dto.email,
        phone: dto.phone,
        passwordHash: hashedPassword,
        lastLoginAt: new Date(),
      },
    });

    // Create profile
    await this.prisma.userProfile.create({
      data: {
        userId: user.id,
      },
    });

    // Log activity
    await this.prisma.userActivity.create({
      data: {
        userId: user.id,
        type: 'REGISTER',
        metadata: { method: 'email' },
        ipAddress,
        userAgent,
      },
    });

    const tokens = await this.generateTokens(user.id, ipAddress, userAgent);

    // Emit event
    await this.eventBus.emit({
      name: 'user.registered',
      payload: { userId: user.id, email: user.email },
      metadata: { correlationId: `register_${user.id}`, userId: user.id },
      timestamp: new Date(),
    });

    return {
      ...tokens,
      user: this.sanitizeUser(user),
    };
  }

  // ==========================================
  // LOGIN
  // ==========================================

  async login(dto: LoginDto, ipAddress?: string, userAgent?: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.isBanned) {
      throw new UnauthorizedException(`Account banned: ${user.banReason || 'Contact support'}`);
    }

    const isValidPassword = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isValidPassword) {
      // Log failed attempt
      await this.prisma.userActivity.create({
        data: {
          userId: user.id,
          type: 'LOGIN_FAILED',
          metadata: { method: 'password' },
          ipAddress,
          userAgent,
        },
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    // Update last login
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // Log activity
    await this.prisma.userActivity.create({
      data: {
        userId: user.id,
        type: 'LOGIN',
        metadata: { method: 'password' },
        ipAddress,
        userAgent,
      },
    });

    const tokens = await this.generateTokens(user.id, ipAddress, userAgent);

    return {
      ...tokens,
      user: this.sanitizeUser(user),
    };
  }

  // ==========================================
  // REFRESH TOKEN
  // ==========================================

  async refreshToken(dto: RefreshTokenDto) {
    // Find session with refresh token
    const session = await this.prisma.session.findFirst({
      where: {
        refreshToken: dto.refreshToken,
        revokedAt: null,
      },
      include: { user: true },
    });

    if (!session) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (session.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    if (session.user.isBanned) {
      throw new UnauthorizedException('User is banned');
    }

    // Revoke old session
    await this.prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });

    // Generate new tokens
    const tokens = await this.generateTokens(
      session.userId,
      session.ipAddress || undefined,
      session.userAgent || undefined,
    );

    return tokens;
  }

  // ==========================================
  // LOGOUT
  // ==========================================

  async logout(userId: string, refreshToken?: string) {
    // Revoke specific session
    if (refreshToken) {
      await this.prisma.session.updateMany({
        where: { refreshToken },
        data: { revokedAt: new Date() },
      });
    }

    // Blacklist access token
    // The access token will be blacklisted in Redis
  }

  async logoutAllDevices(userId: string) {
    await this.prisma.session.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });

    // Clear all user sessions from Redis
    await this.redis.delete(`user:sessions:${userId}`);
  }

  // ==========================================
  // SESSION MANAGEMENT
  // ==========================================

  async getSessions(userId: string) {
    const sessions = await this.prisma.session.findMany({
      where: {
        userId,
        revokedAt: null,
      },
      orderBy: { lastUsedAt: 'desc' },
    });

    return sessions.map(s => ({
      id: s.id,
      deviceId: s.deviceId,
      ipAddress: s.ipAddress,
      userAgent: s.userAgent,
      lastUsedAt: s.lastUsedAt,
      expiresAt: s.expiresAt,
      isCurrent: false, // Will be set by client
    }));
  }

  async revokeSession(userId: string, sessionId: string) {
    const session = await this.prisma.session.findFirst({
      where: {
        id: sessionId,
        userId,
      },
    });

    if (!session) {
      throw new BadRequestException('Session not found');
    }

    await this.prisma.session.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });

    return { success: true };
  }

  // ==========================================
  // PASSWORD MANAGEMENT
  // ==========================================

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const isValidPassword = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!isValidPassword) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, this.bcryptRounds);

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: hashedPassword },
    });

    // Revoke all sessions after password change
    await this.logoutAllDevices(userId);

    return { success: true };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      // Don't reveal if user exists
      return { success: true };
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');

    // Send email with reset link
    await this.eventBus.emit({
      name: 'user.password_reset_requested',
      payload: { userId: user.id, email: user.email, token: resetToken },
      metadata: { correlationId: `reset_${user.id}`, userId: user.id },
      timestamp: new Date(),
    });

    return { success: true };
  }

  async resetPassword(dto: ResetPasswordDto) {
    // In a real implementation, you would verify the token here
    // For now, we'll just update the password without email check
    // The token would be validated against a stored hash in production

    // Find user by token (simplified - in production, you'd verify the token)
    const user = await this.prisma.user.findFirst({
      where: {
        // In production, you'd check resetToken hash here
        email: dto.email, // This assumes email is passed
      },
    });

    if (!user) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, this.bcryptRounds);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: hashedPassword },
    });

    // Revoke all sessions
    await this.logoutAllDevices(user.id);

    return { success: true };
  }

  // ==========================================
  // TOKEN GENERATION
  // ==========================================

  private async generateTokens(userId: string, ipAddress?: string, userAgent?: string) {
    // Check session limit
    const sessionCount = await this.prisma.session.count({
      where: {
        userId,
        revokedAt: null,
      },
    });

    if (sessionCount >= this.MAX_SESSIONS) {
      // Revoke oldest session
      const oldest = await this.prisma.session.findFirst({
        where: {
          userId,
          revokedAt: null,
        },
        orderBy: { lastUsedAt: 'asc' },
      });

      if (oldest) {
        await this.prisma.session.update({
          where: { id: oldest.id },
          data: { revokedAt: new Date() },
        });
      }
    }

    const accessToken = this.jwtService.sign(
      { sub: userId },
      {
        secret: process.env.JWT_ACCESS_SECRET,
        expiresIn: process.env.JWT_ACCESS_EXPIRES || '15m',
      },
    );

    const refreshToken = crypto.randomBytes(64).toString('hex');
    const deviceId = uuidv4();

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    await this.prisma.session.create({
      data: {
        userId,
        refreshToken,
        deviceId,
        ipAddress,
        userAgent,
        expiresAt,
        lastUsedAt: new Date(),
      },
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: 900, // 15 minutes in seconds
    };
  }

  // ==========================================
  // BLACKLIST
  // ==========================================

  async blacklistAccessToken(accessToken: string) {
    const decoded = this.jwtService.decode(accessToken) as any;
    if (decoded?.exp) {
      const ttl = (decoded.exp * 1000) - Date.now();
      if (ttl > 0) {
        await this.redis.set(`blacklist:${accessToken}`, 'true', ttl / 1000);
      }
    }
  }

  async isTokenBlacklisted(accessToken: string): Promise<boolean> {
    const result = await this.redis.get(`blacklist:${accessToken}`);
    return !!result;
  }

  // ==========================================
  // HELPERS
  // ==========================================

  async validateUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        isActive: true,
        isBanned: true,
        isAdmin: true,
        avatarUrl: true,
        ratingAvg: true,
        isVerified: true,
      },
    });

    if (!user || user.isBanned || !user.isActive) {
      return null;
    }

    return user;
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        reputation: true,
        _count: {
          select: {
            listings: {
              where: { status: 'ACTIVE' },
            },
            ratingsReceived: true,
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return this.sanitizeUser(user);
  }

  private sanitizeUser(user: any) {
    const { passwordHash, ...safe } = user;
    return safe;
  }
}
