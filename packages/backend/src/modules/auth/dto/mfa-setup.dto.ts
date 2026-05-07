import { IsString, Length, IsOptional } from 'class-validator';

export class MfaVerifyDto {
  /**
   * 6-digit TOTP token from authenticator app.
   */
  @IsString()
  @Length(6, 6, { message: 'TOTP token must be exactly 6 digits' })
  totp: string;

  /**
   * Optional intermediate session token returned by /auth/login when
   * mfaRequired=true. Used to bind verification to the login attempt.
   */
  @IsOptional()
  @IsString()
  sessionToken?: string;
}

export class MfaBackupCodeDto {
  /**
   * One-time backup code (8-16 chars).
   */
  @IsString()
  @Length(8, 16)
  backupCode: string;

  @IsOptional()
  @IsString()
  sessionToken?: string;
}

export interface MfaSetupResponseDto {
  qrCode: string; // data:image/png;base64,...
  secret: string; // Base32 secret, shown ONCE for manual entry
  backupCodes: string[]; // 10 single-use codes (plaintext, returned ONCE)
  otpauthUrl: string;
}
