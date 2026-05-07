import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  HttpCode,
  HttpStatus,
  ValidationPipe,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';
import { MfaVerifyDto, MfaBackupCodeDto } from './dto/mfa-setup.dto';
import { RefreshDto, AuthTokensDto, UserPublicDto } from './dto/refresh.dto';
import { JwtAuthGuard, Public } from './guards/jwt-auth.guard';

@Controller('auth')
@UseGuards(JwtAuthGuard)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // -----------------------------------------------------------------------
  // PUBLIC: signup, login, refresh, verify-login
  // -----------------------------------------------------------------------

  @Public()
  @Post('signup')
  @HttpCode(HttpStatus.CREATED)
  async signup(
    @Body(new ValidationPipe({ transform: true, whitelist: true })) dto: SignupDto,
  ): Promise<UserPublicDto> {
    return this.authService.signup(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body(new ValidationPipe({ transform: true, whitelist: true })) dto: LoginDto,
    @Req() req: Request,
  ) {
    return this.authService.login(dto, {
      userAgent: req.headers['user-agent'],
      ipAddress: this.extractIp(req),
    });
  }

  @Public()
  @Post('mfa/verify-login')
  @HttpCode(HttpStatus.OK)
  async verifyMfaLogin(
    @Body(new ValidationPipe({ transform: true, whitelist: true })) dto: MfaVerifyDto,
    @Req() req: Request,
  ): Promise<{ tokens: AuthTokensDto; user: UserPublicDto }> {
    if (!dto.sessionToken) {
      throw new BadRequestException('sessionToken is required for /auth/mfa/verify-login');
    }
    return this.authService.verifyMfaLogin(dto.sessionToken, dto.totp, {
      userAgent: req.headers['user-agent'],
      ipAddress: this.extractIp(req),
    });
  }

  /**
   * Step-2 of login via single-use BACKUP CODE.
   * Used when the user has lost the authenticator device.
   * Each successful match consumes the code (single-use).
   */
  @Public()
  @Post('mfa/verify-login-backup')
  @HttpCode(HttpStatus.OK)
  async verifyMfaLoginBackup(
    @Body(new ValidationPipe({ transform: true, whitelist: true })) dto: MfaBackupCodeDto,
    @Req() req: Request,
  ): Promise<{ tokens: AuthTokensDto; user: UserPublicDto }> {
    if (!dto.sessionToken) {
      throw new BadRequestException(
        'sessionToken is required for /auth/mfa/verify-login-backup',
      );
    }
    return this.authService.verifyBackupCode(dto.sessionToken, dto.backupCode, {
      userAgent: req.headers['user-agent'],
      ipAddress: this.extractIp(req),
    });
  }

  @Public()
  @Get('refresh')
  @HttpCode(HttpStatus.OK)
  async refreshGet(@Req() req: Request): Promise<AuthTokensDto> {
    // Accept refresh token from either secure cookie or X-Refresh-Token header.
    const cookieToken = (req as any).cookies?.refreshToken;
    const headerToken = req.headers['x-refresh-token'] as string | undefined;
    const token = cookieToken || headerToken;

    if (!token) {
      throw new BadRequestException(
        'Refresh token required (cookie "refreshToken" or header X-Refresh-Token)',
      );
    }

    return this.authService.refresh(token, {
      userAgent: req.headers['user-agent'],
      ipAddress: this.extractIp(req),
    });
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refreshPost(
    @Body(new ValidationPipe({ transform: true, whitelist: true })) dto: RefreshDto,
    @Req() req: Request,
  ): Promise<AuthTokensDto> {
    return this.authService.refresh(dto.refreshToken, {
      userAgent: req.headers['user-agent'],
      ipAddress: this.extractIp(req),
    });
  }

  // -----------------------------------------------------------------------
  // AUTHENTICATED: mfa setup/verify, logout
  // -----------------------------------------------------------------------

  @Post('mfa/setup')
  @HttpCode(HttpStatus.OK)
  async setupMfa(@Req() req: Request) {
    const user = (req as any).user;
    return this.authService.setupMfa(user.id, user.tenant_id);
  }

  @Post('mfa/verify')
  @HttpCode(HttpStatus.OK)
  async verifyMfaEnrollment(
    @Body(new ValidationPipe({ transform: true, whitelist: true })) dto: MfaVerifyDto,
    @Req() req: Request,
  ) {
    const user = (req as any).user;
    return this.authService.verifyMfaEnrollment(user.id, user.tenant_id, dto.totp);
  }

  @Public()
  @Post('password/reset-request')
  @HttpCode(HttpStatus.OK)
  async requestPasswordReset(
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    dto: { email: string },
  ): Promise<{ message: string; resetToken?: string }> {
    const result = await this.authService.requestPasswordReset(dto.email);
    return {
      message: 'If the email is registered, a password reset link has been sent.',
      // resetToken is exposed only when NODE_ENV !== production so integration
      // tests can drive the flow end-to-end without an email server.
      ...(process.env.NODE_ENV !== 'production' && result.resetToken
        ? { resetToken: result.resetToken }
        : {}),
    };
  }

  @Public()
  @Post('password/reset')
  @HttpCode(HttpStatus.OK)
  async applyPasswordReset(
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    dto: { resetToken: string; newPassword: string },
  ): Promise<{ message: string }> {
    await this.authService.applyPasswordReset(dto.resetToken, dto.newPassword);
    return { message: 'Password updated. Please sign in again.' };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Body(new ValidationPipe({ transform: true, whitelist: true })) dto: RefreshDto,
  ): Promise<void> {
    await this.authService.logout(dto.refreshToken);
  }

  @Get('me')
  async me(@Req() req: Request): Promise<UserPublicDto> {
    const user = (req as any).user;
    // user is already populated by JwtAuthGuard; return the slice we want
    // exposed to the frontend.
    return {
      id: user.id,
      email: user.email,
      tenant_id: user.tenant_id,
      role: user.role,
      full_name: user.full_name || '',
      mfa_enrolled: user.mfa_enrolled ?? false,
    };
  }

  // -----------------------------------------------------------------------
  // helpers
  // -----------------------------------------------------------------------

  private extractIp(req: Request): string | undefined {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.length > 0) {
      return forwarded.split(',')[0].trim();
    }
    return req.socket?.remoteAddress;
  }
}
