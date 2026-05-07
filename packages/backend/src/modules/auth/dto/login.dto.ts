import { IsEmail, IsString, MinLength, MaxLength, IsOptional, Length } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'A valid email address is required' })
  @MaxLength(255)
  email: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(128)
  password: string;

  /**
   * TOTP token (6 digits). Required only on second-step MFA verification.
   * If absent on /auth/login, server returns mfaRequired=true + sessionToken.
   */
  @IsOptional()
  @IsString()
  @Length(6, 6, { message: 'TOTP token must be exactly 6 digits' })
  totp?: string;
}
