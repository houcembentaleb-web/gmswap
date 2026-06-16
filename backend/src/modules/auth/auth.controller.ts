import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Request,
  Res,
  Req,
  Delete,
  Param,
} from '@nestjs/common';
import { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RegisterDto, LoginDto, RefreshTokenDto, ChangePasswordDto, ForgotPasswordDto, ResetPasswordDto } from './dto';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 3600 } })
  async register(
    @Body() dto: RegisterDto,
    @Req() req,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ip = req.headers['x-forwarded-for'] || req.ip;
    const userAgent = req.headers['user-agent'];
    
    const result = await this.authService.register(dto, ip as string, userAgent);
    
    this.setAuthCookies(res, result.accessToken, result.refreshToken);
    
    return { user: result.user };
  }

  @Post('login')
  @Throttle({ default: { limit: 10, ttl: 600 } })
  async login(
    @Body() dto: LoginDto,
    @Req() req,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ip = req.headers['x-forwarded-for'] || req.ip;
    const userAgent = req.headers['user-agent'];
    
    const result = await this.authService.login(dto, ip as string, userAgent);
    
    this.setAuthCookies(res, result.accessToken, result.refreshToken);
    
    return { user: result.user };
  }

  @Post('refresh')
  @Throttle({ default: { limit: 20, ttl: 300 } })
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.refreshToken(dto);
    
    res.cookie('accessToken', result.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 15 * 60 * 1000,
      path: '/',
    });
    
    return { message: 'Token refreshed' };
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  async logout(
    @Request() req,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = req.cookies?.refreshToken;
    await this.authService.logout(req.user.id, refreshToken);
    
    res.clearCookie('accessToken', { path: '/' });
    res.clearCookie('refreshToken', { path: '/' });
    
    return { message: 'Logged out successfully' };
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout/all')
  async logoutAllDevices(@Request() req) {
    await this.authService.logoutAllDevices(req.user.id);
    return { message: 'All devices logged out' };
  }

  @UseGuards(JwtAuthGuard)
  @Get('sessions')
  async getSessions(@Request() req) {
    return this.authService.getSessions(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('sessions/:id')
  async revokeSession(@Request() req, @Param('id') id: string) {
    return this.authService.revokeSession(req.user.id, id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getProfile(@Request() req) {
    return this.authService.getProfile(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  @Throttle({ default: { limit: 3, ttl: 3600 } })
  async changePassword(@Request() req, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(req.user.id, dto);
  }

  @Post('forgot-password')
  @Throttle({ default: { limit: 3, ttl: 3600 } })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post('reset-password')
  @Throttle({ default: { limit: 3, ttl: 3600 } })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  private setAuthCookies(res: Response, accessToken: string, refreshToken: string) {
    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 15 * 60 * 1000,
      path: '/',
    });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: '/',
    });
  }
}