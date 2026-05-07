import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export type AppRole = 'admin' | 'accountant' | 'viewer';

export const ROLES_KEY = 'roles';

/**
 * Decorator to declare required roles for a route or controller.
 *   @Roles('admin', 'accountant')
 *   @Post('entries')
 */
export const Roles = (...roles: AppRole[]) => SetMetadata(ROLES_KEY, roles);

/**
 * Role-based access control guard.
 *
 * Hierarchy is intentionally NOT implicit — admins do not auto-inherit
 * accountant routes unless `admin` is listed in @Roles(). This forces
 * explicit declarations and prevents accidental privilege escalation.
 *
 * Must be paired with JwtAuthGuard to populate request.user.role first.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<AppRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // No @Roles() on route → allow (rely on JwtAuthGuard alone).
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest();
    const userRole = req.user?.role as AppRole | undefined;

    if (!userRole) {
      throw new ForbiddenException('User role not present on request');
    }

    if (!required.includes(userRole)) {
      throw new ForbiddenException(
        `Insufficient permissions: requires one of [${required.join(', ')}], have ${userRole}`,
      );
    }

    return true;
  }
}
