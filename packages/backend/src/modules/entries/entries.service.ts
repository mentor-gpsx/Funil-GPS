import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
  Inject,
} from '@nestjs/common';
import { Pool } from 'pg';
import { CreateEntryDto } from './dto/create-entry.dto';
import { ReverseEntryDto } from './dto/reverse-entry.dto';
import { EntryResponseDto, EntryLineResponseDto } from './dto/entry-response.dto';
import { REQUEST } from '@nestjs/core';
import { Request } from 'express';

@Injectable()
export class EntriesService {
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

  private getCurrentUserId(): string {
    const userId = this.request.user?.id;
    if (!userId) {
      throw new BadRequestException('User ID not found in request');
    }
    return userId;
  }

  async create(createEntryDto: CreateEntryDto): Promise<EntryResponseDto> {
    const tenantId = this.getTenantId();
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL app.current_tenant = $1', [tenantId]);

      // Create entry
      const entryResult = await client.query(
        `INSERT INTO journal_entries (tenant_id, entry_date, description)
         VALUES ($1, $2, $3)
         RETURNING id, tenant_id, entry_date, description, posted_at, posted_by, is_reversed, reversal_of, created_at`,
        [tenantId, createEntryDto.entry_date, createEntryDto.description || null],
      );

      const entry = entryResult.rows[0];
      const entryId = entry.id;

      // Add lines if provided
      let lines: EntryLineResponseDto[] = [];
      if (createEntryDto.lines && createEntryDto.lines.length > 0) {
        for (let i = 0; i < createEntryDto.lines.length; i++) {
          const lineDto = createEntryDto.lines[i];

          // Validate one-sided
          const hasDebit = lineDto.debit !== undefined && lineDto.debit > 0;
          const hasCredit = lineDto.credit !== undefined && lineDto.credit > 0;

          if (hasDebit && hasCredit) {
            throw new BadRequestException(
              `Line ${i + 1}: must be one-sided (debit XOR credit, not both)`,
            );
          }

          // Validate account exists
          const account = await client.query(
            'SELECT id FROM chart_of_accounts WHERE tenant_id = $1 AND id = $2 AND is_active = true',
            [tenantId, lineDto.account_id],
          );

          if (account.rows.length === 0) {
            throw new BadRequestException(`Line ${i + 1}: Account not found or is inactive`);
          }

          const lineResult = await client.query(
            `INSERT INTO journal_entry_lines (tenant_id, entry_id, account_id, description, debit, credit, line_order)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id, entry_id, account_id, description, debit, credit, line_order, created_at`,
            [
              tenantId,
              entryId,
              lineDto.account_id,
              lineDto.description || null,
              lineDto.debit || null,
              lineDto.credit || null,
              i + 1,
            ],
          );

          lines.push(lineResult.rows[0]);
        }
      }

      await client.query('COMMIT');

      return {
        ...entry,
        status: 'DRAFT',
        lines,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async findAll(
    page: number = 1,
    limit: number = 50,
    status?: 'DRAFT' | 'POSTED',
    dateFrom?: string,
    dateTo?: string,
  ): Promise<{ data: EntryResponseDto[]; total: number }> {
    const tenantId = this.getTenantId();
    const offset = (page - 1) * limit;
    const client = await this.pool.connect();

    try {
      await client.query('SET LOCAL app.current_tenant = $1', [tenantId]);

      let query = 'SELECT * FROM journal_entries WHERE tenant_id = $1';
      const params: any[] = [tenantId];

      // Filter by status
      if (status === 'DRAFT') {
        query += ' AND posted_at IS NULL';
      } else if (status === 'POSTED') {
        query += ' AND posted_at IS NOT NULL';
      }

      // Filter by date range
      if (dateFrom) {
        query += ' AND entry_date >= $' + (params.length + 1);
        params.push(dateFrom);
      }

      if (dateTo) {
        query += ' AND entry_date <= $' + (params.length + 1);
        params.push(dateTo);
      }

      query += ' ORDER BY entry_date DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
      params.push(limit, offset);

      const result = await client.query(query, params);

      // Count total
      let countQuery = 'SELECT COUNT(*) as count FROM journal_entries WHERE tenant_id = $1';
      const countParams: any[] = [tenantId];

      if (status === 'DRAFT') {
        countQuery += ' AND posted_at IS NULL';
      } else if (status === 'POSTED') {
        countQuery += ' AND posted_at IS NOT NULL';
      }

      if (dateFrom) {
        countQuery += ' AND entry_date >= $' + (countParams.length + 1);
        countParams.push(dateFrom);
      }

      if (dateTo) {
        countQuery += ' AND entry_date <= $' + (countParams.length + 1);
        countParams.push(dateTo);
      }

      const countResult = await client.query(countQuery, countParams);

      const entries: EntryResponseDto[] = result.rows.map(row => ({
        ...row,
        status: row.posted_at ? 'POSTED' : 'DRAFT',
      }));

      return {
        data: entries,
        total: parseInt(countResult.rows[0].count, 10),
      };
    } finally {
      client.release();
    }
  }

  async findOne(id: string): Promise<EntryResponseDto> {
    const tenantId = this.getTenantId();
    const client = await this.pool.connect();

    try {
      await client.query('SET LOCAL app.current_tenant = $1', [tenantId]);

      const result = await client.query(
        'SELECT * FROM journal_entries WHERE tenant_id = $1 AND id = $2',
        [tenantId, id],
      );

      if (result.rows.length === 0) {
        throw new NotFoundException('Entry not found');
      }

      const entry = result.rows[0];

      // Get lines with account details
      const linesResult = await client.query(
        `SELECT
          jel.id, jel.entry_id, jel.account_id, jel.description,
          jel.debit, jel.credit, jel.line_order, jel.created_at,
          json_build_object('id', coa.id, 'code', coa.code, 'name', coa.name) as account
         FROM journal_entry_lines jel
         LEFT JOIN chart_of_accounts coa ON jel.account_id = coa.id AND jel.tenant_id = coa.tenant_id
         WHERE jel.tenant_id = $1 AND jel.entry_id = $2
         ORDER BY jel.line_order ASC`,
        [tenantId, id],
      );

      return {
        ...entry,
        status: entry.posted_at ? 'POSTED' : 'DRAFT',
        lines: linesResult.rows,
      };
    } finally {
      client.release();
    }
  }

  async post(id: string): Promise<EntryResponseDto> {
    const tenantId = this.getTenantId();
    const userId = this.getCurrentUserId();
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL app.current_tenant = $1', [tenantId]);

      // Check entry exists and is not posted
      const entryResult = await client.query(
        'SELECT id, posted_at FROM journal_entries WHERE tenant_id = $1 AND id = $2',
        [tenantId, id],
      );

      if (entryResult.rows.length === 0) {
        throw new NotFoundException('Entry not found');
      }

      if (entryResult.rows[0].posted_at !== null) {
        throw new ConflictException('Entry is already posted');
      }

      // Validate balance: SUM(debit) = SUM(credit)
      const balanceResult = await client.query(
        `SELECT COALESCE(SUM(debit), 0) as total_debit, COALESCE(SUM(credit), 0) as total_credit
         FROM journal_entry_lines
         WHERE tenant_id = $1 AND entry_id = $2`,
        [tenantId, id],
      );

      const { total_debit, total_credit } = balanceResult.rows[0];

      if (Math.abs(total_debit - total_credit) > 0.01) {
        throw new BadRequestException(
          `Entry is not balanced. Debit: ${total_debit}, Credit: ${total_credit}`,
        );
      }

      // Update entry to posted
      const updateResult = await client.query(
        `UPDATE journal_entries
         SET posted_at = NOW(), posted_by = $3
         WHERE tenant_id = $1 AND id = $2
         RETURNING *`,
        [tenantId, id, userId],
      );

      await client.query('COMMIT');

      // Fetch full entry with lines
      return this.findOne(id);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async reverse(id: string, reverseEntryDto?: ReverseEntryDto): Promise<EntryResponseDto> {
    const tenantId = this.getTenantId();
    const userId = this.getCurrentUserId();
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL app.current_tenant = $1', [tenantId]);

      // Check entry exists and is posted
      const entryResult = await client.query(
        'SELECT id, entry_date, description, posted_at FROM journal_entries WHERE tenant_id = $1 AND id = $2',
        [tenantId, id],
      );

      if (entryResult.rows.length === 0) {
        throw new NotFoundException('Entry not found');
      }

      if (entryResult.rows[0].posted_at === null) {
        throw new BadRequestException('Cannot reverse a draft entry');
      }

      const originalEntry = entryResult.rows[0];

      // Create reversal entry
      const reversalDescription = `Reversal of ${originalEntry.description || `entry ${id}`}`;
      const reversalEntryResult = await client.query(
        `INSERT INTO journal_entries (tenant_id, entry_date, description)
         VALUES ($1, $2, $3)
         RETURNING id, tenant_id, entry_date, description, posted_at, posted_by, is_reversed, reversal_of, created_at`,
        [tenantId, originalEntry.entry_date, reversalDescription],
      );

      const reversalEntryId = reversalEntryResult.rows[0].id;

      // Get original lines
      const linesResult = await client.query(
        `SELECT account_id, description, debit, credit, line_order
         FROM journal_entry_lines
         WHERE tenant_id = $1 AND entry_id = $2
         ORDER BY line_order ASC`,
        [tenantId, id],
      );

      // Create reversed lines
      for (const line of linesResult.rows) {
        await client.query(
          `INSERT INTO journal_entry_lines (tenant_id, entry_id, account_id, description, debit, credit, line_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            tenantId,
            reversalEntryId,
            line.account_id,
            line.description,
            line.credit || null,
            line.debit || null,
            line.line_order,
          ],
        );
      }

      // Post reversal entry automatically
      await client.query(
        `UPDATE journal_entries
         SET posted_at = NOW(), posted_by = $3
         WHERE tenant_id = $1 AND id = $2`,
        [tenantId, reversalEntryId, userId],
      );

      // Mark original as reversed
      await client.query(
        `UPDATE journal_entries
         SET is_reversed = true, reversal_of = $3
         WHERE tenant_id = $1 AND id = $2`,
        [tenantId, id, reversalEntryId],
      );

      await client.query('COMMIT');

      // Fetch reversal entry with lines
      return this.findOne(reversalEntryId);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
