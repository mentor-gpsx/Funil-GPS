import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit.service';
import { computeAuditHash } from '../../../utils/audit-hash';

/**
 * Audit service integration-style tests.
 *
 * Strategy: instantiate the service directly with a mocked pg Pool and a
 * synthetic Express Request, mirroring the pattern used by other backend
 * tests in this repo. We don't import @nestjs/testing because it isn't
 * installed in this package; direct instantiation gives us the same coverage
 * for service-level logic (the controller is a thin pass-through and is
 * exercised via the same service).
 *
 * Coverage targets (per AC):
 *   - Listing with pagination & filters
 *   - Single-record validation (PASS and FAIL)
 *   - Chain validation (PASS, prev_hash break, hash tamper)
 *   - RLS isolation: SET LOCAL app.current_tenant invoked on every operation
 */
describe('AuditService', () => {
  let service: AuditService;
  let mockClient: { query: jest.Mock; release: jest.Mock };
  let mockPool: { connect: jest.Mock };

  const tenantId = '550e8400-e29b-41d4-a716-446655440001';
  const otherTenantId = '550e8400-e29b-41d4-a716-446655440099';
  const userId = '550e8400-e29b-41d4-a716-446655440002';
  const recordId = '550e8400-e29b-41d4-a716-446655440010';

  function newService(reqUser: any = { tenant_id: tenantId, id: userId }): AuditService {
    mockClient = { query: jest.fn(), release: jest.fn() };
    mockPool = { connect: jest.fn().mockResolvedValue(mockClient) };
    const fakeRequest: any = { user: reqUser };
    // The service's constructor signature: (pool, request).
    // We bypass DI and pass the same shape directly.
    return new (AuditService as any)(mockPool, fakeRequest);
  }

  beforeEach(() => {
    service = newService();
  });

  // ---------- helpers ------------------------------------------------------

  /**
   * Build a mock DB row that reflects what the trigger would have written,
   * including a hash computed via the SAME formula the service will recompute.
   * This is how we test "happy path: validation returns valid: true" without
   * a real DB.
   */
  function buildRow(opts: {
    id: number;
    operation: 'INSERT' | 'UPDATE' | 'DELETE';
    table_name?: string;
    record_id?: string;
    oldValue: unknown;
    newValue: unknown;
    changedAt?: string;     // ISO with 'Z' suffix to match trigger's to_char output
    prevHash?: string;
    tamperHash?: string;     // when set, store this hash instead of the correct one
  }) {
    const changed_at_iso = opts.changedAt ?? '2026-05-07T12:00:00.000000Z';
    const prev_hash = opts.prevHash ?? '';
    const correctHash = computeAuditHash({
      prevHash: prev_hash,
      oldValue: opts.oldValue,
      newValue: opts.newValue,
      changedAt: changed_at_iso,
    });
    return {
      id: String(opts.id),
      tenant_id: tenantId,
      table_name: opts.table_name ?? 'journal_entries',
      operation: opts.operation,
      record_id: opts.record_id ?? recordId,
      old_value: opts.oldValue,
      new_value: opts.newValue,
      changed_by: userId,
      changed_at: new Date(changed_at_iso),
      changed_at_iso,
      prev_hash,
      hash: opts.tamperHash ?? correctHash,
    };
  }

  // ---------- list ---------------------------------------------------------

  describe('list', () => {
    it('paginates with defaults and applies SET LOCAL for tenant scoping', async () => {
      const rows = [
        buildRow({ id: 1, operation: 'INSERT', oldValue: null, newValue: { a: 1 } }),
      ];
      mockClient.query
        .mockResolvedValueOnce(undefined) // SET LOCAL
        .mockResolvedValueOnce({ rows })  // data
        .mockResolvedValueOnce({ rows: [{ count: '1' }] }); // count

      const result = await service.list({});

      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(50);
      expect(result.data[0].id).toBe('1');
      expect(result.data[0].operation).toBe('INSERT');

      // Tenant scoping must be set on the connection.
      const setLocalCall = mockClient.query.mock.calls.find(
        c => typeof c[0] === 'string' && c[0].includes('SET LOCAL'),
      );
      expect(setLocalCall).toBeDefined();
      expect(setLocalCall![1]).toEqual([tenantId]);
    });

    it('applies table_name, operation, user_id, record_id filters', async () => {
      mockClient.query
        .mockResolvedValueOnce(undefined)              // SET LOCAL
        .mockResolvedValueOnce({ rows: [] })           // data
        .mockResolvedValueOnce({ rows: [{ count: '0' }] }); // count

      await service.list({
        table_name: 'journal_entries',
        operation: 'UPDATE',
        user_id: userId,
        record_id: recordId,
      });

      // The data SQL must contain all four filter clauses.
      const dataCall = mockClient.query.mock.calls.find(
        c => typeof c[0] === 'string' && c[0].includes('FROM audit_logs') && c[0].includes('LIMIT'),
      );
      expect(dataCall).toBeDefined();
      const sql = dataCall![0] as string;
      expect(sql).toMatch(/table_name = \$\d+/);
      expect(sql).toMatch(/operation = \$\d+/);
      expect(sql).toMatch(/changed_by = \$\d+/);
      expect(sql).toMatch(/record_id = \$\d+/);
    });

    it('applies date_from and date_to filters', async () => {
      mockClient.query
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      await service.list({
        date_from: '2026-05-01',
        date_to: '2026-05-31',
      });

      const dataCall = mockClient.query.mock.calls.find(
        c => typeof c[0] === 'string' && c[0].includes('LIMIT'),
      );
      const sql = dataCall![0] as string;
      expect(sql).toMatch(/changed_at >= \$\d+/);
      expect(sql).toMatch(/changed_at <= \$\d+/);
    });

    it('clamps limit to a sane upper bound', async () => {
      mockClient.query
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      const result = await service.list({ limit: 99999 });
      expect(result.limit).toBeLessThanOrEqual(500);
    });

    it('rejects when tenant_id is missing from request', async () => {
      const noTenantService = newService({});
      await expect(noTenantService.list({})).rejects.toThrow(BadRequestException);
    });
  });

  // ---------- findOne ------------------------------------------------------

  describe('findOne', () => {
    it('returns valid:true when stored hash matches recomputed', async () => {
      const row = buildRow({ id: 42, operation: 'INSERT', oldValue: null, newValue: { x: 1 } });
      mockClient.query
        .mockResolvedValueOnce(undefined)        // SET LOCAL
        .mockResolvedValueOnce({ rows: [row] }); // SELECT

      const result = await service.findOne('42');

      expect(result.id).toBe('42');
      expect(result.validation.valid).toBe(true);
      expect(result.validation.recomputedHash).toBe(row.hash);
    });

    it('returns valid:false when stored hash has been tampered', async () => {
      const tampered = buildRow({
        id: 42,
        operation: 'UPDATE',
        oldValue: { x: 1 },
        newValue: { x: 2 },
        tamperHash: 'f'.repeat(64), // store wrong hash
      });
      mockClient.query
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ rows: [tampered] });

      const result = await service.findOne('42');

      expect(result.validation.valid).toBe(false);
      expect(result.validation.reason).toMatch(/does not match/);
      expect(result.validation.recomputedHash).not.toBe(tampered.hash);
    });

    it('throws NotFoundException when audit row missing', async () => {
      mockClient.query
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ rows: [] });

      await expect(service.findOne('999')).rejects.toThrow(NotFoundException);
    });

    it('rejects non-numeric ids early (no DB hit)', async () => {
      await expect(service.findOne('not-a-number')).rejects.toThrow(BadRequestException);
      // Did not connect to DB.
      expect(mockPool.connect).not.toHaveBeenCalled();
    });
  });

  // ---------- validateChain ----------------------------------------------

  describe('validateChain', () => {
    it('returns valid:true for an intact chain (single record key)', async () => {
      const r1 = buildRow({
        id: 1,
        operation: 'INSERT',
        oldValue: null,
        newValue: { v: 1 },
        changedAt: '2026-05-07T12:00:00.000000Z',
      });
      const r2 = buildRow({
        id: 2,
        operation: 'UPDATE',
        oldValue: { v: 1 },
        newValue: { v: 2 },
        changedAt: '2026-05-07T12:00:01.000000Z',
        prevHash: r1.hash,
      });

      mockClient.query
        .mockResolvedValueOnce(undefined) // SET LOCAL
        .mockResolvedValueOnce({ rows: [r1, r2] });

      const result = await service.validateChain({ record_id: recordId });
      expect(result.valid).toBe(true);
      expect(result.recordsChecked).toBe(2);
      expect(result.brokenAt).toBeNull();
    });

    it('detects hash tampering and reports brokenAt', async () => {
      const r1 = buildRow({
        id: 1,
        operation: 'INSERT',
        oldValue: null,
        newValue: { v: 1 },
        changedAt: '2026-05-07T12:00:00.000000Z',
      });
      const r2 = buildRow({
        id: 2,
        operation: 'UPDATE',
        oldValue: { v: 1 },
        newValue: { v: 2 },
        changedAt: '2026-05-07T12:00:01.000000Z',
        prevHash: r1.hash,
        tamperHash: 'a'.repeat(64), // record 2 has been tampered
      });

      mockClient.query
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ rows: [r1, r2] });

      const result = await service.validateChain({ record_id: recordId });
      expect(result.valid).toBe(false);
      expect(result.brokenAt).toBe('2');
      expect(result.reason).toMatch(/does not match/);
    });

    it('detects prev_hash link break', async () => {
      const r1 = buildRow({
        id: 1,
        operation: 'INSERT',
        oldValue: null,
        newValue: { v: 1 },
        changedAt: '2026-05-07T12:00:00.000000Z',
      });
      // r2 has wrong prev_hash (does not point to r1.hash)
      const r2 = buildRow({
        id: 2,
        operation: 'UPDATE',
        oldValue: { v: 1 },
        newValue: { v: 2 },
        changedAt: '2026-05-07T12:00:01.000000Z',
        prevHash: 'b'.repeat(64),
      });

      mockClient.query
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ rows: [r1, r2] });

      const result = await service.validateChain({});
      expect(result.valid).toBe(false);
      expect(result.brokenAt).toBe('2');
      expect(result.reason).toMatch(/prev_hash does not match/);
    });

    it('validates multiple independent chains (per record_id)', async () => {
      // Two records, each with their own 1-entry chain.
      const recordA = '550e8400-e29b-41d4-a716-446655440a01';
      const recordB = '550e8400-e29b-41d4-a716-446655440b01';

      const a1 = buildRow({
        id: 1,
        operation: 'INSERT',
        record_id: recordA,
        oldValue: null,
        newValue: { id: recordA },
      });
      const b1 = buildRow({
        id: 2,
        operation: 'INSERT',
        record_id: recordB,
        oldValue: null,
        newValue: { id: recordB },
      });

      mockClient.query
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ rows: [a1, b1] });

      const result = await service.validateChain({ table_name: 'journal_entries' });
      expect(result.valid).toBe(true);
      expect(result.recordsChecked).toBe(2);
    });
  });

  // ---------- RLS isolation -----------------------------------------------

  describe('RLS isolation', () => {
    it('always sets app.current_tenant before reading', async () => {
      mockClient.query
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      await service.list({});

      const firstCall = mockClient.query.mock.calls[0];
      expect(firstCall[0]).toMatch(/SET LOCAL app\.current_tenant/);
      expect(firstCall[1]).toEqual([tenantId]);
    });

    it('binds queries to the requesting tenant, not a different one', async () => {
      mockClient.query
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      await service.list({});

      const dataCall = mockClient.query.mock.calls.find(
        c => typeof c[0] === 'string' && c[0].includes('LIMIT'),
      );
      expect(dataCall![1][0]).toBe(tenantId);
      expect(dataCall![1][0]).not.toBe(otherTenantId);
    });

    it('always releases the connection (even on error)', async () => {
      mockClient.query
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('boom'));

      await expect(service.list({})).rejects.toThrow('boom');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });
});
