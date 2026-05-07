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
exports.AccountsService = void 0;
const common_1 = require("@nestjs/common");
const pg_1 = require("pg");
const core_1 = require("@nestjs/core");
let AccountsService = class AccountsService {
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
    async create(createAccountDto) {
        const tenantId = this.getTenantId();
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            await client.query('SET LOCAL app.current_tenant = $1', [tenantId]);
            const existingCode = await client.query('SELECT id FROM chart_of_accounts WHERE tenant_id = $1 AND code = $2', [tenantId, createAccountDto.code]);
            if (existingCode.rows.length > 0) {
                throw new common_1.ConflictException(`Account code "${createAccountDto.code}" already exists for this tenant`);
            }
            if (createAccountDto.parent_id) {
                const parentAccount = await client.query('SELECT id FROM chart_of_accounts WHERE tenant_id = $1 AND id = $2 AND is_active = true', [tenantId, createAccountDto.parent_id]);
                if (parentAccount.rows.length === 0) {
                    throw new common_1.BadRequestException('Parent account not found or is inactive');
                }
            }
            const result = await client.query(`INSERT INTO chart_of_accounts (tenant_id, code, name, account_type, parent_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, tenant_id, code, name, account_type, parent_id, is_active, created_at`, [
                tenantId,
                createAccountDto.code,
                createAccountDto.name,
                createAccountDto.account_type,
                createAccountDto.parent_id || null,
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
    async findAll(page = 1, limit = 50, search) {
        const tenantId = this.getTenantId();
        const offset = (page - 1) * limit;
        const client = await this.pool.connect();
        try {
            await client.query('SET LOCAL app.current_tenant = $1', [tenantId]);
            let query = 'SELECT * FROM chart_of_accounts WHERE tenant_id = $1 AND is_active = true';
            const params = [tenantId];
            if (search) {
                query += ' AND (code ILIKE $' + (params.length + 1) + ' OR name ILIKE $' + (params.length + 1) + ')';
                params.push(`%${search}%`);
            }
            query += ' ORDER BY code ASC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
            params.push(limit, offset);
            const result = await client.query(query, params);
            let countQuery = 'SELECT COUNT(*) as count FROM chart_of_accounts WHERE tenant_id = $1 AND is_active = true';
            const countParams = [tenantId];
            if (search) {
                countQuery += ' AND (code ILIKE $2 OR name ILIKE $2)';
                countParams.push(`%${search}%`);
            }
            const countResult = await client.query(countQuery, countParams);
            return {
                data: result.rows,
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
            const result = await client.query('SELECT * FROM chart_of_accounts WHERE tenant_id = $1 AND id = $2 AND is_active = true', [tenantId, id]);
            if (result.rows.length === 0) {
                throw new common_1.NotFoundException('Account not found');
            }
            return result.rows[0];
        }
        finally {
            client.release();
        }
    }
    async update(id, updateAccountDto) {
        const tenantId = this.getTenantId();
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            await client.query('SET LOCAL app.current_tenant = $1', [tenantId]);
            const account = await client.query('SELECT id FROM chart_of_accounts WHERE tenant_id = $1 AND id = $2', [tenantId, id]);
            if (account.rows.length === 0) {
                throw new common_1.NotFoundException('Account not found');
            }
            if (updateAccountDto.parent_id) {
                const parentAccount = await client.query('SELECT id FROM chart_of_accounts WHERE tenant_id = $1 AND id = $2 AND is_active = true', [tenantId, updateAccountDto.parent_id]);
                if (parentAccount.rows.length === 0) {
                    throw new common_1.BadRequestException('Parent account not found or is inactive');
                }
            }
            const updates = [];
            const params = [tenantId, id];
            if (updateAccountDto.name) {
                updates.push(`name = $${params.length + 1}`);
                params.push(updateAccountDto.name);
            }
            if (updateAccountDto.parent_id) {
                updates.push(`parent_id = $${params.length + 1}`);
                params.push(updateAccountDto.parent_id);
            }
            if (updates.length === 0) {
                const result = await client.query('SELECT * FROM chart_of_accounts WHERE tenant_id = $1 AND id = $2', [tenantId, id]);
                await client.query('COMMIT');
                return result.rows[0];
            }
            const result = await client.query(`UPDATE chart_of_accounts
         SET ${updates.join(', ')}
         WHERE tenant_id = $1 AND id = $2
         RETURNING *`, params);
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
    async remove(id) {
        const tenantId = this.getTenantId();
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            await client.query('SET LOCAL app.current_tenant = $1', [tenantId]);
            const result = await client.query('UPDATE chart_of_accounts SET is_active = false WHERE tenant_id = $1 AND id = $2 RETURNING id', [tenantId, id]);
            if (result.rows.length === 0) {
                throw new common_1.NotFoundException('Account not found');
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
};
exports.AccountsService = AccountsService;
exports.AccountsService = AccountsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)('DB_POOL')),
    __param(1, (0, common_1.Inject)(core_1.REQUEST)),
    __metadata("design:paramtypes", [typeof (_a = typeof pg_1.Pool !== "undefined" && pg_1.Pool) === "function" ? _a : Object, Object])
], AccountsService);
//# sourceMappingURL=accounts.service.js.map