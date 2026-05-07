import { Module } from '@nestjs/common';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';
import { AuthModule } from '../auth/auth.module';

/**
 * Audit module exposes read-only endpoints over audit_logs.
 *
 * Imports AuthModule so JwtAuthGuard's JwtService dependency is satisfied.
 * (Same pattern used implicitly in EntriesModule / AccountsModule, where the
 * top-level app composition wires AuthModule globally — but importing it here
 * makes this module independently testable.)
 */
@Module({
  imports: [AuthModule],
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
