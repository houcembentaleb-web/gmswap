import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';

@Injectable()
export class IsAdminGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException('User not authenticated');
    }

    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { isAdmin: true, isActive: true, isBanned: true },
    });

    if (!dbUser || !dbUser.isAdmin) {
      throw new UnauthorizedException('Admin access required');
    }

    if (!dbUser.isActive || dbUser.isBanned) {
      throw new UnauthorizedException('Account inactive or banned');
    }

    return true;
  }
}