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
exports.EntryLinesService = void 0;
const common_1 = require("@nestjs/common");
const pg_1 = require("pg");
const core_1 = require("@nestjs/core");
let EntryLinesService = class EntryLinesService {
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
    async addLine(entryId, createLineDto) {
        const tenantId = this.getTenantId();
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            await client.query('SET LOCAL app.current_tenant = $1', [tenantId]);
            const entry = await client.query('SELECT id, posted_at FROM journal_entries WHERE tenant_id = $1 AND id = $2', [tenantId, entryId]);
            if (entry.rows.length === 0) {
                throw new common_1.NotFoundException('Entry not found');
            }
            if (entry.rows[0].posted_at !== null) {
                throw new common_1.ConflictException('Cannot add lines to a posted entry');
            }
            const hasDebit = createLineDto.debit !== undefined && createLineDto.debit > 0;
            const hasCredit = createLineDto.credit !== undefined && createLineDto.credit > 0;
            if (hasDebit && hasCredit) {
                throw new common_1.BadRequestException('Line must be one-sided: debit XOR credit, not both');
            }
            if (!hasDebit && !hasCredit) {
                throw new common_1.BadRequestException('Line must have either debit or credit amount');
            }
            const account = await client.query('SELECT id FROM chart_of_accounts WHERE tenant_id = $1 AND id = $2 AND is_active = true', [tenantId, createLineDto.account_id]);
            if (account.rows.length === 0) {
                throw new common_1.BadRequestException('Account not found or is inactive');
            }
            const orderResult = await client.query('SELECT MAX(line_order) as max_order FROM journal_entry_lines WHERE tenant_id = $1 AND entry_id = $2', [tenantId, entryId]);
            const nextLineOrder = (orderResult.rows[0]?.max_order ?? 0) + 1;
            const result = await client.query(`INSERT INTO journal_entry_lines (tenant_id, entry_id, account_id, description, debit, credit, line_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, entry_id, account_id, description, debit, credit, line_order, created_at`, [
                tenantId,
                entryId,
                createLineDto.account_id,
                createLineDto.description || null,
                createLineDto.debit || null,
                createLineDto.credit || null,
                nextLineOrder,
            ]);
            await client.query('COMMIT');
            return result.rows[0];
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
    async editLine(entryId, lineId, createLineDto) {
        const tenantId = this.getTenantId();
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            await client.query('SET LOCAL app.current_tenant = $1', [tenantId]);
            const entry = await client.query('SELECT posted_at FROM journal_entries WHERE tenant_id = $1 AND id = $2', [tenantId, entryId]);
            if (entry.rows.length === 0) {
                throw new common_1.NotFoundException('Entry not found');
            }
            if (entry.rows[0].posted_at !== null) {
                throw new common_1.ConflictException('Cannot edit lines in a posted entry');
            }
            const line = await client.query('SELECT id FROM journal_entry_lines WHERE tenant_id = $1 AND id = $2 AND entry_id = $3', [tenantId, lineId, entryId]);
            if (line.rows.length === 0) {
                throw new common_1.NotFoundException('Line not found');
            }
            const hasDebit = createLineDto.debit !== undefined && createLineDto.debit > 0;
            const hasCredit = createLineDto.credit !== undefined && createLineDto.credit > 0;
            if (hasDebit && hasCredit) {
                throw new common_1.BadRequestException('Line must be one-sided: debit XOR credit, not both');
            }
            if (!hasDebit && !hasCredit) {
                throw new common_1.BadRequestException('Line must have either debit or credit amount');
            }
            if (createLineDto.account_id) {
                const account = await client.query('SELECT id FROM chart_of_accounts WHERE tenant_id = $1 AND id = $2 AND is_active = true', [tenantId, createLineDto.account_id]);
                if (account.rows.length === 0) {
                    throw new common_1.BadRequestException('Account not found or is inactive');
                }
            }
            const updates = [];
            const params = [tenantId, lineId, entryId];
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
            const result = await client.query(`UPDATE journal_entry_lines
         SET ${updates.join(', ')}
         WHERE tenant_id = $1 AND id = $2 AND entry_id = $3
         RETURNING id, entry_id, account_id, description, debit, credit, line_order, created_at`, params);
            await client.query('COMMIT');
            return result.rows[0];
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
    async deleteLine(entryId, lineId) {
        const tenantId = this.getTenantId();
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            await client.query('SET LOCAL app.current_tenant = $1', [tenantId]);
            const entry = await client.query('SELECT posted_at FROM journal_entries WHERE tenant_id = $1 AND id = $2', [tenantId, entryId]);
            if (entry.rows.length === 0) {
                throw new common_1.NotFoundException('Entry not found');
            }
            if (entry.rows[0].posted_at !== null) {
                throw new common_1.ConflictException('Cannot delete lines from a posted entry');
            }
            const result = await client.query('DELETE FROM journal_entry_lines WHERE tenant_id = $1 AND id = $2 AND entry_id = $3 RETURNING id', [tenantId, lineId, entryId]);
            if (result.rows.length === 0) {
                throw new common_1.NotFoundException('Line not found');
            }
            await client.query('COMMIT');
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
    async getLinesByEntry(entryId) {
        const tenantId = this.getTenantId();
        const client = await this.pool.connect();
        try {
            await client.query('SET LOCAL app.current_tenant = $1', [tenantId]);
            const result = await client.query(`SELECT id, entry_id, account_id, description, debit, credit, line_order, created_at
         FROM journal_entry_lines
         WHERE tenant_id = $1 AND entry_id = $2
         ORDER BY line_order ASC`, [tenantId, entryId]);
            return result.rows;
        }
        finally {
            client.release();
        }
    }
};
exports.EntryLinesService = EntryLinesService;
exports.EntryLinesService = EntryLinesService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)('DB_POOL')),
    __param(1, (0, common_1.Inject)(core_1.REQUEST)),
    __metadata("design:paramtypes", [typeof (_a = typeof pg_1.Pool !== "undefined" && pg_1.Pool) === "function" ? _a : Object, Object])
], EntryLinesService);
//# sourceMappingURL=entry-lines.service.js.map