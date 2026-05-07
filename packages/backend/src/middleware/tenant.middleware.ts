import { Injectable, NestMiddleware, BadRequestException, Inject } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import { JwtService } from '../modules/auth/jwt.service';

/**
 * Tenant resolution middleware.
 *
 * Extracts tenant_id from the JWT custom claim and asserts it on the
 * request. The actual `SET LOCAL app.current_tenant` per-query is executed
 * inside each service method (where the transaction lives) — doing it
 * here would set the GUC on a connection that is then released back to
 * the pool, leaking state to the next request.
 *
 * Why both middleware AND per-query SET LOCAL:
 * - Middleware: validates JWT presence, prevents unauthenticated calls
 *   from reaching the controller, attaches request.user.
 * - SET LOCAL inside services: actually scopes the query, survives pool
 *   recycling, paired with BEGIN/COMMIT transactions.
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(
    @Inject('DB_POOL') private readonly _pool: Pool,
    private readonly jwtService: JwtService,
  ) {}

  use(req: Request, _res: Response, next: NextFunction): void {
    // Skip auth endpoints — they are public and the user is not yet
    // authenticated, so there is no tenant to scope to.
    const skipPaths = ['/auth/login', '/auth/signup', '/auth/refresh', '/auth/mfa/verify-login'];
    if (skipPaths.some(p => req.path.startsWith(p))) {
      return next();
    }

    const header = req.headers['authorization'];
    if (!header || typeof header !== 'string' || !header.startsWith('Bearer ')) {
      // Let the route guard produce the proper 401 with details.
      return next();
    }

    const token = header.slice('Bearer '.length).trim();
    if (!token) return next();

    try {
      const payload = this.jwtService.verify(token, 'access');
      if (!payload.tenant_id) {
        throw new BadRequestException('JWT missing tenant_id custom claim');
      }
      (req as any).user = {
        id: payload.sub,
        tenant_id: payload.tenant_id,
        role: payload.role,
        email: payload.email,
      };
    } catch {
      // Defer to JwtAuthGuard — it will throw a clean UnauthorizedException
      // with the right reason. Middleware should never short-circuit a 401
      // because the guard owns that contract.
    }

    next();
  }
}

/**
 * Helper: bind `SET LOCAL app.current_tenant` to a pg client inside a
 * transaction. Use this in every service method that opens a `pool.connect()`.
 *
 * Example:
 *   const client = await pool.connect();
 *   try {
 *     await client.query('BEGIN');
 *     await setTenantContext(client, tenantId);
 *     // ... queries automatically scoped by RLS
 *     await client.query('COMMIT');
 *   } finally { client.release(); }
 */
export async function setTenantContext(
  client: { query: (q: string, params?: any[]) => Promise<any> },
  tenantId: string,
): Promise<void> {
  if (!tenantId || typeof tenantId !== 'string') {
    throw new BadRequestException('tenantId is required for SET LOCAL');
  }
  // Use parameterised placeholder to prevent SQL injection of the GUC value.
  await client.query('SET LOCAL app.current_tenant = $1', [tenantId]);
}
