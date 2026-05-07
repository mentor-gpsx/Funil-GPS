import 'express';

declare global {
  namespace Express {
    interface Request {
      user?: {
        sub: string;
        tenant_id: string;
        role: string;
        email: string;
        type: string;
        iat: number;
        exp: number;
        iss: string;
        aud: string;
      };
    }
  }
}
