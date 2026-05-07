import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuditService } from './audit.service';
import {
  AuditEntryWithValidationDto,
  AuditOperation,
  PaginatedAuditDto,
  ValidateAuditChainResponseDto,
} from './dto/audit-entry.dto';

/**
 * Audit endpoints (read-only).
 *
 * Routes:
 *   GET /api/audit              — list with pagination & filters
 *   GET /api/audit/validate     — validate hash chain (filtered slice)
 *   GET /api/audit/:id          — single record + validation status
 *
 * IMPORTANT route-order note: /validate is declared BEFORE /:id so Express
 * doesn't route "validate" into ParseIntPipe-decorated :id and 400.
 */
@Controller('api/audit')
@UseGuards(JwtAuthGuard)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  async list(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('table_name') table_name?: string,
    @Query('operation') operation?: AuditOperation,
    @Query('user_id') user_id?: string,
    @Query('record_id') record_id?: string,
    @Query('date_from') date_from?: string,
    @Query('date_to') date_to?: string,
  ): Promise<PaginatedAuditDto> {
    return this.auditService.list({
      page,
      limit,
      table_name,
      operation,
      user_id,
      record_id,
      date_from,
      date_to,
    });
  }

  @Get('validate')
  async validate(
    @Query('table_name') table_name?: string,
    @Query('record_id') record_id?: string,
    @Query('date_from') date_from?: string,
    @Query('date_to') date_to?: string,
  ): Promise<ValidateAuditChainResponseDto> {
    return this.auditService.validateChain({
      table_name,
      record_id,
      date_from,
      date_to,
    });
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<AuditEntryWithValidationDto> {
    return this.auditService.findOne(id);
  }
}
