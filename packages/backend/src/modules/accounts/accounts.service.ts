import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
  Inject,
} from '@nestjs/common';
import { Pool } from 'pg';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { AccountResponseDto } from './dto/account-response.dto';
import { REQUEST } from '@nestjs/core';
import { Request } from 'express';

@Injectable()
export class AccountsService {
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

  async create(createAccountDto: CreateAccountDto): Promise<AccountResponseDto> {
    const tenantId = this.getTenantId();
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL app.current_tenant = $1', [tenantId]);

      // Check if code is unique per tenant
      const existingCode = await client.query(
        'SELECT id FROM chart_of_accounts WHERE tenant_id = $1 AND code = $2',
        [tenantId, createAccountDto.code],
      );

      if (existingCode.rows.length > 0) {
        throw new ConflictException(
          `Account code "${createAccountDto.code}" already exists for this tenant`,
        );
      }

      // Validate parent account if provided
      if (createAccountDto.parent_id) {
        const parentAccount = await client.query(
          'SELECT id FROM chart_of_accounts WHERE tenant_id = $1 AND id = $2 AND is_active = true',
          [tenantId, createAccountDto.parent_id],
        );

        if (parentAccount.rows.length === 0) {
          throw new BadRequestException('Parent account not found or is inactive');
        }
      }

      // Insert account
      const result = await client.query(
        `INSERT INTO chart_of_accounts (tenant_id, code, name, account_type, parent_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, tenant_id, code, name, account_type, parent_id, is_active, created_at`,
        [
          tenantId,
          createAccountDto.code,
          createAccountDto.name,
          createAccountDto.account_type,
          createAccountDto.parent_id || null,
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

  async findAll(
    page: number = 1,
    limit: number = 50,
    search?: string,
  ): Promise<{ data: AccountResponseDto[]; total: number }> {
    const tenantId = this.getTenantId();
    const offset = (page - 1) * limit;

    const client = await this.pool.connect();

    try {
      await client.query('SET LOCAL app.current_tenant = $1', [tenantId]);

      let query = 'SELECT * FROM chart_of_accounts WHERE tenant_id = $1 AND is_active = true';
      const params: any[] = [tenantId];

      if (search) {
        query += ' AND (code ILIKE $' + (params.length + 1) + ' OR name ILIKE $' + (params.length + 1) + ')';
        params.push(`%${search}%`);
      }

      query += ' ORDER BY code ASC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
      params.push(limit, offset);

      const result = await client.query(query, params);

      // Get total count
      let countQuery = 'SELECT COUNT(*) as count FROM chart_of_accounts WHERE tenant_id = $1 AND is_active = true';
      const countParams: any[] = [tenantId];

      if (search) {
        countQuery += ' AND (code ILIKE $2 OR name ILIKE $2)';
        countParams.push(`%${search}%`);
      }

      const countResult = await client.query(countQuery, countParams);

      return {
        data: result.rows,
        total: parseInt(countResult.rows[0].count, 10),
      };
    } finally {
      client.release();
    }
  }

  async findOne(id: string): Promise<AccountResponseDto> {
    const tenantId = this.getTenantId();
    const client = await this.pool.connect();

    try {
      await client.query('SET LOCAL app.current_tenant = $1', [tenantId]);

      const result = await client.query(
        'SELECT * FROM chart_of_accounts WHERE tenant_id = $1 AND id = $2 AND is_active = true',
        [tenantId, id],
      );

      if (result.rows.length === 0) {
        throw new NotFoundException('Account not found');
      }

      return result.rows[0];
    } finally {
      client.release();
    }
  }

  async update(id: string, updateAccountDto: UpdateAccountDto): Promise<AccountResponseDto> {
    const tenantId = this.getTenantId();
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL app.current_tenant = $1', [tenantId]);

      // Check account exists
      const account = await client.query(
        'SELECT id FROM chart_of_accounts WHERE tenant_id = $1 AND id = $2',
        [tenantId, id],
      );

      if (account.rows.length === 0) {
        throw new NotFoundException('Account not found');
      }

      // Validate parent account if provided
      if (updateAccountDto.parent_id) {
        const parentAccount = await client.query(
          'SELECT id FROM chart_of_accounts WHERE tenant_id = $1 AND id = $2 AND is_active = true',
          [tenantId, updateAccountDto.parent_id],
        );

        if (parentAccount.rows.length === 0) {
          throw new BadRequestException('Parent account not found or is inactive');
        }
      }

      // Update account
      const updates: string[] = [];
      const params: any[] = [tenantId, id];

      if (updateAccountDto.name) {
        updates.push(`name = $${params.length + 1}`);
        params.push(updateAccountDto.name);
      }

      if (updateAccountDto.parent_id) {
        updates.push(`parent_id = $${params.length + 1}`);
        params.push(updateAccountDto.parent_id);
      }

      if (updates.length === 0) {
        const result = await client.query(
          'SELECT * FROM chart_of_accounts WHERE tenant_id = $1 AND id = $2',
          [tenantId, id],
        );
        await client.query('COMMIT');
        return result.rows[0];
      }

      const result = await client.query(
        `UPDATE chart_of_accounts
         SET ${updates.join(', ')}
         WHERE tenant_id = $1 AND id = $2
         RETURNING *`,
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

  async remove(id: string): Promise<void> {
    const tenantId = this.getTenantId();
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL app.current_tenant = $1', [tenantId]);

      const result = await client.query(
        'UPDATE chart_of_accounts SET is_active = false WHERE tenant_id = $1 AND id = $2 RETURNING id',
        [tenantId, id],
      );

      if (result.rows.length === 0) {
        throw new NotFoundException('Account not found');
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
