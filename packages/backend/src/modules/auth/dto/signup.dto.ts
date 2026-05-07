import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  IsUUID,
  IsEnum,
  IsOptional,
  Matches,
} from 'class-validator';

export enum UserRole {
  ADMIN = 'admin',
  ACCOUNTANT = 'accountant',
  VIEWER = 'viewer',
}

export class SignupDto {
  @IsEmail({}, { message: 'A valid email address is required' })
  @MaxLength(255)
  email: string;

  /**
   * Strong password policy:
   * - Minimum 8 characters
   * - At least one uppercase, one lowercase, one digit
   */
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(128)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/, {
    message:
      'Password must contain at least one uppercase letter, one lowercase letter, and one digit',
  })
  password: string;

  @IsString()
  @MaxLength(255)
  full_name: string;

  @IsUUID('4', { message: 'tenant_id must be a valid UUID' })
  tenant_id: string;

  @IsOptional()
  @IsEnum(UserRole, { message: 'role must be one of: admin, accountant, viewer' })
  role?: UserRole;
}
