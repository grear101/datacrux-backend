import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

// Apply together, in this order: @UseGuards(JwtAuthGuard, PlatformAdminGuard)
// JwtAuthGuard verifies the token and sets req.user; this guard just checks
// what role that verified user actually has. Nobody can forge role:
// 'superadmin' without your JWT_SECRET, since it's baked into the signed
// token at login time (see AuthService).
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user || user.role !== 'superadmin') {
      throw new ForbiddenException('This action requires a Datacrux team account.');
    }
    return true;
  }
}
