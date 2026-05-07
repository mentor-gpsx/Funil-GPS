import { TenantMiddleware, setTenantContext } from '../../../middleware/tenant.middleware';
import { JwtService } from '../jwt.service';
import { Pool } from 'pg';
import { BadRequestException } from '@nestjs/common';

describe('TenantMiddleware', () => {
  let jwt: JwtService;
  let middleware: TenantMiddleware;
  let mockPool: Pool;

  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-12345';
    jwt = new JwtService();
    mockPool = { connect: jest.fn(), query: jest.fn() } as unknown as Pool;
    middleware = new TenantMiddleware(mockPool, jwt);
  });

  function makeReq(authHeader?: string, path: string = '/api/accounts') {
    return {
      headers: authHeader ? { authorization: authHeader } : {},
      path,
    } as any;
  }

  it('skips public auth paths', () => {
    const req = makeReq(undefined, '/auth/login');
    const next = jest.fn();
    middleware.use(req, {} as any, next);
    expect(next).toHaveBeenCalled();
    expect(req.user).toBeUndefined();
  });

  it('skips when no Authorization header (lets guard handle 401)', () => {
    const req = makeReq();
    const next = jest.fn();
    middleware.use(req, {} as any, next);
    expect(next).toHaveBeenCalled();
    expect(req.user).toBeUndefined();
  });

  it('attaches request.user when valid Bearer token is present', () => {
    const { token } = jwt.signAccessToken({
      id: 'u1',
      tenant_id: 'tenant-mw',
      role: 'accountant',
      email: 'mw@example.com',
    });
    const req = makeReq(`Bearer ${token}`);
    const next = jest.fn();
    middleware.use(req, {} as any, next);
    expect(req.user).toEqual({
      id: 'u1',
      tenant_id: 'tenant-mw',
      role: 'accountant',
      email: 'mw@example.com',
    });
    expect(next).toHaveBeenCalled();
  });

  it('does not throw on invalid token (delegates to guard)', () => {
    const req = makeReq('Bearer invalid-token-here');
    const next = jest.fn();
    expect(() => middleware.use(req, {} as any, next)).not.toThrow();
    expect(req.user).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });
});

describe('setTenantContext helper', () => {
  it('issues SET LOCAL with parameterised tenant id', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    await setTenantContext(client, 'tenant-xyz');
    expect(client.query).toHaveBeenCalledWith('SET LOCAL app.current_tenant = $1', ['tenant-xyz']);
  });

  it('rejects empty tenant id', async () => {
    const client = { query: jest.fn() };
    await expect(setTenantContext(client, '')).rejects.toThrow(BadRequestException);
    expect(client.query).not.toHaveBeenCalled();
  });

  it('rejects non-string tenant id', async () => {
    const client = { query: jest.fn() };
    await expect(setTenantContext(client, 123 as any)).rejects.toThrow(BadRequestException);
  });
});
