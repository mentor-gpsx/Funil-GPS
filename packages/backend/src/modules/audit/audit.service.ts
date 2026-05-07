import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Inject,
} from '@nestjs/common';
import { Pool } from 'pg';
import { REQUEST } from '@nestjs/core';
import { Request } from 'express';
import {
  AuditEntryDto,
  AuditEntryWithValidationDto,
  ListAuditQueryDto,
  PaginatedAuditDto,
  ValidateAuditChainResponseDto,
} from './dto/audit-entry.dto';
import { computeAuditHash, validateAuditChain, AuditChainEntry } from '../../utils/audit-hash';

/**
 * Audit service — read-only API over the trigger-populated audit_logs table.
 *
 * RLS handles tenant scoping at the DB level; we additionally pass tenant_id
 * in WHERE clauses so the planner uses the (tenant_id, ...) indexes from
 * 006_audit_log_schema.sql.
 *
 * The hash payload format (timestamp formatting in particular) MUST match
 * 007_audit_triggers.sql:compute_audit_hash. Because PG's TIMESTAMPTZ output
 * format and JS's Date.toISOString format differ, this service reads the
 * `changed_at` column as the formatted text the trigger used (via to_char in
 * SELECT) and passes that text verbatim to computeAuditHash. This avoids
 * round-tripping through Date and the timezone string mismatch that would
 * follow.
 */
@Injectable()
export class AuditService {
  constructor(
    @Inject('DB_POOL') private pool: Pool,
    @Inject(REQUEST) private request: Request,
  ) {}

  private getTenantId(): string {
    // Cast: tenant middleware/JwtAuthGuard attaches `user` to Request at
    // runtime. Express's stock typings don't know about it; rather than
    // pull in a global declaration in a single-story scope, we cast locally.
    const tenantId = (this.request as any).user?.tenant_id;
    if (!tenantId) {
      throw new BadRequestException('Tenant ID not found in request');
    }
    return tenantId;
  }

  /**
   * Canonical SELECT projection. We always project `changed_at_iso` (the text
   * form the trigger uses for hashing) alongside `changed_at` (the native
   * timestamptz, useful for UI display).
   *
   * Keep the to_char format string in lockstep with compute_audit_hash() in
   * 007_audit_triggers.sql.
   */
  private readonly SELECT_PROJECTION = `
    id::text                          AS id,
    tenant_id,
    table_name,
    operation,
    record_id,
    old_value,
    new_value,
    changed_by,
    changed_at,
    to_char(changed_at AT TIME ZONE 'UTC',
            'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS changed_at_iso,
    prev_hash,
    hash
  `;

  async list(query: ListAuditQueryDto): Promise<PaginatedAuditDto> {
    const tenantId = this.getTenantId();
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.max(1, Math.min(500, query.limit ?? 50));
    const offset = (page - 1) * limit;

    const client = await this.pool.connect();
    try {
      await client.query('SET LOCAL app.current_tenant = $1', [tenantId]);

      const filters: string[] = ['tenant_id = $1'];
      const params: any[] = [tenantId];

      if (query.table_name) {
        filters.push(`table_name = $${params.length + 1}`);
        params.push(query.table_name);
      }
      if (query.operation) {
        filters.push(`operation = $${params.length + 1}`);
        params.push(query.operation);
      }
      if (query.user_id) {
        filters.push(`changed_by = $${params.length + 1}`);
        params.push(query.user_id);
      }
      if (query.record_id) {
        filters.push(`record_id = $${params.length + 1}`);
        params.push(query.record_id);
      }
      if (query.date_from) {
        filters.push(`changed_at >= $${params.length + 1}`);
        params.push(query.date_from);
      }
      if (query.date_to) {
        filters.push(`changed_at <= $${params.length + 1}`);
        params.push(query.date_to);
      }

      const where = filters.join(' AND ');

      // Use the (tenant_id, changed_at DESC) index for the most common case;
      // when filtered by table_name we still benefit from the composite index
      // (tenant_id, table_name, changed_at DESC).
      const dataSql = `
        SELECT ${this.SELECT_PROJECTION}
        FROM audit_logs
        WHERE ${where}
        ORDER BY changed_at DESC, id DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `;
      const dataParams = [...params, limit, offset];

      const countSql = `SELECT COUNT(*)::bigint AS count FROM audit_logs WHERE ${where}`;

      const [dataResult, countResult] = await Promise.all([
        client.query(dataSql, dataParams),
        client.query(countSql, params),
      ]);

      const data = dataResult.rows.map(row => this.rowToDto(row));
      const total = parseInt(countResult.rows[0].count, 10);

      return { data, total, page, limit };
    } finally {
      client.release();
    }
  }

  async findOne(id: string): Promise<AuditEntryWithValidationDto> {
    const tenantId = this.getTenantId();
    if (!id || !/^\d+$/.test(id)) {
      throw new BadRequestException('Audit id must be a numeric string');
    }

    const client = await this.pool.connect();
    try {
      await client.query('SET LOCAL app.current_tenant = $1', [tenantId]);

      const result = await client.query(
        `SELECT ${this.SELECT_PROJECTION}
         FROM audit_logs
         WHERE tenant_id = $1 AND id = $2::bigint`,
        [tenantId, id],
      );

      if (result.rows.length === 0) {
        throw new NotFoundException('Audit entry not found');
      }

      const row = result.rows[0];
      const dto = this.rowToDto(row);

      // Recompute and compare. The chain-link check (prev_hash → previous
      // record's hash) is part of validateAuditChain — for a single-record
      // view we only verify "is this record self-consistent with its stored
      // prev_hash, old, new, ts?".
      const recomputed = computeAuditHash({
        prevHash: dto.prev_hash,
        oldValue: dto.old_value,
        newValue: dto.new_value,
        changedAt: row.changed_at_iso,
      });

      const valid = recomputed === dto.hash;
      return {
        ...dto,
        validation: valid
          ? { valid: true, recomputedHash: recomputed }
          : {
              valid: false,
              recomputedHash: recomputed,
              reason: 'Stored hash does not match recomputed hash for this record',
            },
      };
    } finally {
      client.release();
    }
  }

  async validateChain(
    filters: Pick<ListAuditQueryDto, 'table_name' | 'record_id' | 'date_from' | 'date_to'>,
  ): Promise<ValidateAuditChainResponseDto> {
    const tenantId = this.getTenantId();

    // For chain validation, ordering MUST be by id ASC (insertion order),
    // because that is the order in which the trigger built the chain.
    const client = await this.pool.connect();
    try {
      await client.query('SET LOCAL app.current_tenant = $1', [tenantId]);

      const conds: string[] = ['tenant_id = $1'];
      const params: any[] = [tenantId];

      if (filters.table_name) {
        conds.push(`table_name = $${params.length + 1}`);
        params.push(filters.table_name);
      }
      if (filters.record_id) {
        conds.push(`record_id = $${params.length + 1}`);
        params.push(filters.record_id);
      }
      if (filters.date_from) {
        conds.push(`changed_at >= $${params.length + 1}`);
        params.push(filters.date_from);
      }
      if (filters.date_to) {
        conds.push(`changed_at <= $${params.length + 1}`);
        params.push(filters.date_to);
      }

      const sql = `
        SELECT ${this.SELECT_PROJECTION}
        FROM audit_logs
        WHERE ${conds.join(' AND ')}
        ORDER BY tenant_id, table_name, record_id, id ASC
      `;
      const result = await client.query(sql, params);

      // Group by (table_name, record_id) — each is its own chain.
      const chains = new Map<string, AuditChainEntry[]>();
      for (const row of result.rows) {
        const key = `${row.table_name}|${row.record_id}`;
        if (!chains.has(key)) chains.set(key, []);
        chains.get(key)!.push({
          id: row.id,
          hash: row.hash,
          prevHash: row.prev_hash,
          oldValue: row.old_value,
          newValue: row.new_value,
          changedAt: row.changed_at_iso,
        });
      }

      let recordsChecked = 0;
      for (const [, entries] of chains) {
        const r = validateAuditChain(entries);
        recordsChecked += r.recordsChecked;
        if (!r.valid) {
          return {
            valid: false,
            recordsChecked,
            brokenAt: r.brokenAt !== null ? String(r.brokenAt) : null,
            reason: r.reason,
            filters,
          };
        }
      }

      return {
        valid: true,
        recordsChecked,
        brokenAt: null,
        filters,
      };
    } finally {
      client.release();
    }
  }

  private rowToDto(row: any): AuditEntryDto {
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      table_name: row.table_name,
      operation: row.operation,
      record_id: row.record_id,
      old_value: row.old_value,
      new_value: row.new_value,
      changed_by: row.changed_by,
      changed_at: row.changed_at_iso,
      prev_hash: row.prev_hash,
      hash: row.hash,
    };
  }
}
