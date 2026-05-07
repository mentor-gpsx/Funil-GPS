import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtService } from './jwt.service';
import { PasswordService } from './password.service';
import { TotpService } from './totp.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { TenantMiddleware } from '../../middleware/tenant.middleware';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtService,
    PasswordService,
    TotpService,
    JwtAuthGuard,
    RolesGuard,
  ],
  exports: [JwtService, PasswordService, TotpService, JwtAuthGuard, RolesGuard, AuthService],
})
export class AuthModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Apply tenant middleware globally so any authenticated request has
    // `request.user.tenant_id` populated before the route handler runs.
    consumer
      .apply(TenantMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
