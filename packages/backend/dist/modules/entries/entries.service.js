"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.EntriesService = void 0;
const common_1 = require("@nestjs/common");
const pg_1 = require("pg");
const core_1 = require("@nestjs/core");
let EntriesService = class EntriesService {
    pool;
    request;
    constructor(pool, request) {
        this.pool = pool;
        this.request = request;
    }
    getTenantId() {
        const tenantId = this.request.user?.tenant_id;
        if (!tenantId) {
            throw new common_1.BadRequestException('Tenant ID not found in request');
        }
        return tenantId;
    }
    getCurrentUserId() {
        const userId = this.request.user?.sub;
        if (!userId) {
            throw new common_1.BadRequestException('User ID not found in request');
        }
        return userId;
    }
    async create(createEntryDto) {
        const tenantId = this.getTenantId();
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            await client.query('SET LOCAL app.current_tenant = $1', [tenantId]);
            const entryResult = await client.query(`INSERT INTO journal_entries (tenant_id, entry_date, description)
         VALUES ($1, $2, $3)
         RETURNING id, tenant_id, entry_date, description, posted_at, posted_by, is_reversed, reversal_of, created_at`, [tenantId, createEntryDto.entry_date, createEntryDto.description || null]);
            const entry = entryResult.rows[0];
            const entryId = entry.id;
            let lines = [];
            if (createEntryDto.lines && createEntryDto.lines.length > 0) {
                for (let i = 0; i < createEntryDto.lines.length; i++) {
                    const lineDto = createEntryDto.lines[i];
                    const hasDebit = lineDto.debit !== undefined && lineDto.debit > 0;
                    const hasCredit = lineDto.credit !== undefined && lineDto.credit > 0;
                    if (hasDebit && hasCredit) {
                        throw new common_1.BadRequestException(`Line ${i + 1}: must be one-sided (debit XOR credit, not both)`);
                    }
                    const account = await client.query('SELECT id FROM chart_of_accounts WHERE tenant_id = $1 AND id = $2 AND is_active = true', [tenantId, lineDto.account_id]);
                    if (account.rows.length === 0) {
                        throw new common_1.BadRequestException(`Line ${i + 1}: Account not found or is inactive`);
                    }
                    const lineResult = await client.query(`INSERT INTO journal_entry_lines (tenant_id, entry_id, account_id, description, debit, credit, line_order)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id, entry_id, account_id, description, debit, credit, line_order, created_at`, [
                        tenantId,
                        entryId,
                        lineDto.account_id,
                        lineDto.description || null,
                        lineDto.debit || null,
                        lineDto.credit || null,
                        i + 1,
                    ]);
                    lines.push(lineResult.rows[0]);
                }
            }
            await client.query('COMMIT');
            return {
                ...entry,
                status: 'DRAFT',
                lines,
            };
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
    async findAll(page = 1, limit = 50, status, dateFrom, dateTo) {
        const tenantId = this.getTenantId();
        const offset = (page - 1) * limit;
        const client = await this.pool.connect();
        try {
            await client.query('SET LOCAL app.current_tenant = $1', [tenantId]);
            let query = 'SELECT * FROM journal_entries WHERE tenant_id = $1';
            const params = [tenantId];
            if (status === 'DRAFT') {
                query += ' AND posted_at IS NULL';
            }
            else if (status === 'POSTED') {
                query += ' AND posted_at IS NOT NULL';
            }
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
            let countQuery = 'SELECT COUNT(*) as count FROM journal_entries WHERE tenant_id = $1';
            const countParams = [tenantId];
            if (status === 'DRAFT') {
                countQuery += ' AND posted_at IS NULL';
            }
            else if (status === 'POSTED') {
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
            const entries = result.rows.map(row => ({
                ...row,
                status: row.posted_at ? 'POSTED' : 'DRAFT',
            }));
            return {
                data: entries,
                total: parseInt(countResult.rows[0].count, 10),
            };
        }
        finally {
            client.release();
        }
    }
    async findOne(id) {
        const tenantId = this.getTenantId();
        const client = await this.pool.connect();
        try {
            await client.query('SET LOCAL app.current_tenant = $1', [tenantId]);
            const result = await client.query('SELECT * FROM journal_entries WHERE tenant_id = $1 AND id = $2', [tenantId, id]);
            if (result.rows.length === 0) {
                throw new common_1.NotFoundException('Entry not found');
            }
            const entry = result.rows[0];
            const linesResult = await client.query(`SELECT
          jel.id, jel.entry_id, jel.account_id, jel.description,
          jel.debit, jel.credit, jel.line_order, jel.created_at,
          json_build_object('id', coa.id, 'code', coa.code, 'name', coa.name) as account
         FROM journal_entry_lines jel
         LEFT JOIN chart_of_accounts coa ON jel.account_id = coa.id AND jel.tenant_id = coa.tenant_id
         WHERE jel.tenant_id = $1 AND jel.entry_id = $2
         ORDER BY jel.line_order ASC`, [tenantId, id]);
            return {
                ...entry,
                status: entry.posted_at ? 'POSTED' : 'DRAFT',
                lines: linesResult.rows,
            };
        }
        finally {
            client.release();
        }
    }
    async post(id) {
        const tenantId = this.getTenantId();
        const userId = this.getCurrentUserId();
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            await client.query('SET LOCAL app.current_tenant = $1', [tenantId]);
            const entryResult = await client.query('SELECT id, posted_at FROM journal_entries WHERE tenant_id = $1 AND id = $2', [tenantId, id]);
            if (entryResult.rows.length === 0) {
                throw new common_1.NotFoundException('Entry not found');
            }
            if (entryResult.rows[0].posted_at !== null) {
                throw new common_1.ConflictException('Entry is already posted');
            }
            const balanceResult = await client.query(`SELECT COALESCE(SUM(debit), 0) as total_debit, COALESCE(SUM(credit), 0) as total_credit
         FROM journal_entry_lines
         WHERE tenant_id = $1 AND entry_id = $2`, [tenantId, id]);
            const { total_debit, total_credit } = balanceResult.rows[0];
            if (Math.abs(total_debit - total_credit) > 0.01) {
                throw new common_1.BadRequestException(`Entry is not balanced. Debit: ${total_debit}, Credit: ${total_credit}`);
            }
            const updateResult = await client.query(`UPDATE journal_entries
         SET posted_at = NOW(), posted_by = $3
         WHERE tenant_id = $1 AND id = $2
         RETURNING *`, [tenantId, id, userId]);
            await client.query('COMMIT');
            return this.findOne(id);
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
    async reverse(id, reverseEntryDto) {
        const tenantId = this.getTenantId();
        const userId = this.getCurrentUserId();
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            await client.query('SET LOCAL app.current_tenant = $1', [tenantId]);
            const entryResult = await client.query('SELECT id, entry_date, description, posted_at FROM journal_entries WHERE tenant_id = $1 AND id = $2', [tenantId, id]);
            if (entryResult.rows.length === 0) {
                throw new common_1.NotFoundException('Entry not found');
            }
            if (entryResult.rows[0].posted_at === null) {
                throw new common_1.BadRequestException('Cannot reverse a draft entry');
            }
            const originalEntry = entryResult.rows[0];
            const reversalDescription = `Reversal of ${originalEntry.description || `entry ${id}`}`;
            const reversalEntryResult = await client.query(`INSERT INTO journal_entries (tenant_id, entry_date, description)
         VALUES ($1, $2, $3)
         RETURNING id, tenant_id, entry_date, description, posted_at, posted_by, is_reversed, reversal_of, created_at`, [tenantId, originalEntry.entry_date, reversalDescription]);
            const reversalEntryId = reversalEntryResult.rows[0].id;
            const linesResult = await client.query(`SELECT account_id, description, debit, credit, line_order
         FROM journal_entry_lines
         WHERE tenant_id = $1 AND entry_id = $2
         ORDER BY line_order ASC`, [tenantId, id]);
            for (const line of linesResult.rows) {
                await client.query(`INSERT INTO journal_entry_lines (tenant_id, entry_id, account_id, description, debit, credit, line_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`, [
                    tenantId,
                    reversalEntryId,
                    line.account_id,
                    line.description,
                    line.credit || null,
                    line.debit || null,
                    line.line_order,
                ]);
            }
            await client.query(`UPDATE journal_entries
         SET posted_at = NOW(), posted_by = $3
         WHERE tenant_id = $1 AND id = $2`, [tenantId, reversalEntryId, userId]);
            await client.query(`UPDATE journal_entries
         SET is_reversed = true, reversal_of = $3
         WHERE tenant_id = $1 AND id = $2`, [tenantId, id, reversalEntryId]);
            await client.query('COMMIT');
            return this.findOne(reversalEntryId);
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
};
exports.EntriesService = EntriesService;
exports.EntriesService = EntriesService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)('DB_POOL')),
    __param(1, (0, common_1.Inject)(core_1.REQUEST)),
    __metadata("design:paramtypes", [typeof (_a = typeof pg_1.Pool !== "undefined" && pg_1.Pool) === "function" ? _a : Object, Object])
], EntriesService);
//# sourceMappingURL=entries.service.js.map