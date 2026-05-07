import { IsString, MinLength } from 'class-validator';

export class RefreshDto {
  @IsString()
  @MinLength(20)
  refreshToken: string;
}

export interface AuthTokensDto {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // seconds until accessToken expires
  tokenType: 'Bearer';
}

export interface UserPublicDto {
  id: string;
  email: string;
  full_name: string;
  tenant_id: string;
  role: 'admin' | 'accountant' | 'viewer';
  mfa_enrolled: boolean;
}
