import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
  Inject,
} from '@nestjs/common';
import { Pool } from 'pg';
import { CreateEntryLineDto } from './dto/create-entry.dto';
import { EntryLineResponseDto } from './dto/entry-response.dto';
import { REQUEST } from '@nestjs/core';
import { Request } from 'express';

@Injectable()
export class EntryLinesService {
  constructor(
    @Inject('DB_POOL') private pool: Pool,
    @Inject(REQUEST) private request: Request,
  ) {}

  private getTenantId(): string {
    const tenantId = this.request.user?.tenant_id;
    if (!tenantId) {
      throw new BadRequestException('Tenant ID not found in request');
    }
    return tenantId;
  }

  async addLine(
    entryId: string,
    createLineDto: CreateEntryLineDto,
  ): Promise<EntryLineResponseDto> {
    const tenantId = this.getTenantId();
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL app.current_tenant = $1', [tenantId]);

      // Check if entry exists and is not posted
      const entry = await client.query(
        'SELECT id, posted_at FROM journal_entries WHERE tenant_id = $1 AND id = $2',
        [tenantId, entryId],
      );

      if (entry.rows.length === 0) {
        throw new NotFoundException('Entry not found');
      }

      if (entry.rows[0].posted_at !== null) {
        throw new ConflictException('Cannot add lines to a posted entry');
      }

      // Validate one-sided (debit XOR credit)
      const hasDebit = createLineDto.debit !== undefined && createLineDto.debit > 0;
      const hasCredit = createLineDto.credit !== undefined && createLineDto.credit > 0;

      if (hasDebit && hasCredit) {
        throw new BadRequestException('Line must be one-sided: debit XOR credit, not both');
      }

      if (!hasDebit && !hasCredit) {
        throw new BadRequestException('Line must have either debit or credit amount');
      }

      // Validate account exists
      const account = await client.query(
        'SELECT id FROM chart_of_accounts WHERE tenant_id = $1 AND id = $2 AND is_active = true',
        [tenantId, createLineDto.account_id],
      );

      if (account.rows.length === 0) {
        throw new BadRequestException('Account not found or is inactive');
      }

      // Get next line_order
      const orderResult = await client.query(
        'SELECT MAX(line_order) as max_order FROM journal_entry_lines WHERE tenant_id = $1 AND entry_id = $2',
        [tenantId, entryId],
      );

      const nextLineOrder = (orderResult.rows[0]?.max_order ?? 0) + 1;

      // Insert line
      const result = await client.query(
        `INSERT INTO journal_entry_lines (tenant_id, entry_id, account_id, description, debit, credit, line_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, entry_id, account_id, description, debit, credit, line_order, created_at`,
        [
          tenantId,
          entryId,
          createLineDto.account_id,
          createLineDto.description || null,
          createLineDto.debit || null,
          createLineDto.credit || null,
          nextLineOrder,
        ],
      );

      await client.query('COMMIT');
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async editLine(
    entryId: string,
    lineId: string,
    createLineDto: CreateEntryLineDto,
  ): Promise<EntryLineResponseDto> {
    const tenantId = this.getTenantId();
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL app.current_tenant = $1', [tenantId]);

      // Check if entry is not posted
      const entry = await client.query(
        'SELECT posted_at FROM journal_entries WHERE tenant_id = $1 AND id = $2',
        [tenantId, entryId],
      );

      if (entry.rows.length === 0) {
        throw new NotFoundException('Entry not found');
      }

      if (entry.rows[0].posted_at !== null) {
        throw new ConflictException('Cannot edit lines in a posted entry');
      }

      // Check if line exists
      const line = await client.query(
        'SELECT id FROM journal_entry_lines WHERE tenant_id = $1 AND id = $2 AND entry_id = $3',
        [tenantId, lineId, entryId],
      );

      if (line.rows.length === 0) {
        throw new NotFoundException('Line not found');
      }

      // Validate one-sided
      const hasDebit = createLineDto.debit !== undefined && createLineDto.debit > 0;
      const hasCredit = createLineDto.credit !== undefined && createLineDto.credit > 0;

      if (hasDebit && hasCredit) {
        throw new BadRequestException('Line must be one-sided: debit XOR credit, not both');
      }

      if (!hasDebit && !hasCredit) {
        throw new BadRequestException('Line must have either debit or credit amount');
      }

      // Validate account if provided
      if (createLineDto.account_id) {
        const account = await client.query(
          'SELECT id FROM chart_of_accounts WHERE tenant_id = $1 AND id = $2 AND is_active = true',
          [tenantId, createLineDto.account_id],
        );

        if (account.rows.length === 0) {
          throw new BadRequestException('Account not found or is inactive');
        }
      }

      // Update line
      const updates: string[] = [];
      const params: any[] = [tenantId, lineId, entryId];

      if (createLineDto.account_id) {
        updates.push(`account_id = $${params.length + 1}`);
        params.push(createLineDto.account_id);
      }

      if (createLineDto.description !== undefined) {
        updates.push(`description = $${params.length + 1}`);
        params.push(createLineDto.description || null);
      }

      updates.push(`debit = $${params.length + 1}`);
      params.push(createLineDto.debit || null);

      updates.push(`credit = $${params.length + 1}`);
      params.push(createLineDto.credit || null);

      const result = await client.query(
        `UPDATE journal_entry_lines
         SET ${updates.join(', ')}
         WHERE tenant_id = $1 AND id = $2 AND entry_id = $3
         RETURNING id, entry_id, account_id, description, debit, credit, line_order, created_at`,
        params,
      );

      await client.query('COMMIT');
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async deleteLine(entryId: string, lineId: string): Promise<void> {
    const tenantId = this.getTenantId();
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL app.current_tenant = $1', [tenantId]);

      // Check if entry is not posted
      const entry = await client.query(
        'SELECT posted_at FROM journal_entries WHERE tenant_id = $1 AND id = $2',
        [tenantId, entryId],
      );

      if (entry.rows.length === 0) {
        throw new NotFoundException('Entry not found');
      }

      if (entry.rows[0].posted_at !== null) {
        throw new ConflictException('Cannot delete lines from a posted entry');
      }

      // Delete line
      const result = await client.query(
        'DELETE FROM journal_entry_lines WHERE tenant_id = $1 AND id = $2 AND entry_id = $3 RETURNING id',
        [tenantId, lineId, entryId],
      );

      if (result.rows.length === 0) {
        throw new NotFoundException('Line not found');
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getLinesByEntry(entryId: string): Promise<EntryLineResponseDto[]> {
    const tenantId = this.getTenantId();
    const client = await this.pool.connect();

    try {
      await client.query('SET LOCAL app.current_tenant = $1', [tenantId]);

      const result = await client.query(
        `SELECT id, entry_id, account_id, description, debit, credit, line_order, created_at
         FROM journal_entry_lines
         WHERE tenant_id = $1 AND entry_id = $2
         ORDER BY line_order ASC`,
        [tenantId, entryId],
      );

      return result.rows;
    } finally {
      client.release();
    }
  }
}
