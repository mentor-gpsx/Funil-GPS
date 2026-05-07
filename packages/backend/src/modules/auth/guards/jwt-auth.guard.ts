import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { JwtService } from '../jwt.service';

/**
 * Decorator to mark routes as public (skips JwtAuthGuard).
 *   @Public()
 *   @Post('login')
 */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => (target: any, key?: any, descriptor?: any) => {
  if (descriptor) {
    Reflect.defineMetadata(IS_PUBLIC_KEY, true, descriptor.value);
    return descriptor;
  }
  Reflect.defineMetadata(IS_PUBLIC_KEY, true, target);
  return target;
};

/**
 * Validates the `Authorization: Bearer <token>` header. On success, attaches
 * the decoded payload to `request.user` so downstream services (and the
 * tenant middleware) can read tenant_id / role / sub.
 *
 * Tokens with type !== 'access' are rejected — only fully-issued access
 * tokens grant API access. mfa_pending tokens are explicitly NOT allowed
 * here (they only flow through /auth/mfa/verify).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers['authorization'];

    if (!header || typeof header !== 'string' || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or malformed Authorization header');
    }

    const token = header.slice('Bearer '.length).trim();
    if (!token) {
      throw new UnauthorizedException('Empty bearer token');
    }

    const payload = this.jwtService.verify(token, 'access');

    // Attach a normalised user object for downstream code.
    (req as any).user = {
      id: payload.sub,
      tenant_id: payload.tenant_id,
      role: payload.role,
      email: payload.email,
    };

    return true;
  }
}
