import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import * as request from 'supertest';
import { Pool } from 'pg';
import { EntriesService } from '../entries.service';
import { EntryLinesService } from '../entry-lines.service';
import { EntriesController } from '../entries.controller';
import { EntriesModule } from '../entries.module';
import { CreateEntryDto, CreateEntryLineDto } from '../dto/create-entry.dto';
import { ReverseEntryDto } from '../dto/reverse-entry.dto';

describe('EntriesModule', () => {
  let app: INestApplication;
  let service: EntriesService;
  let linesService: EntryLinesService;
  let pool: Pool;

  const mockTenantId = '550e8400-e29b-41d4-a716-446655440001';
  const mockUserId = '550e8400-e29b-41d4-a716-446655440002';
  const mockAccountId1 = '550e8400-e29b-41d4-a716-446655440010';
  const mockAccountId2 = '550e8400-e29b-41d4-a716-446655440011';

  beforeAll(async () => {
    const mockPool = {
      connect: jest.fn(),
      query: jest.fn(),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [EntriesModule],
    })
      .overrideProvider('DB_POOL')
      .useValue(mockPool)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    service = moduleFixture.get<EntriesService>(EntriesService);
    linesService = moduleFixture.get<EntryLinesService>(EntryLinesService);
    pool = moduleFixture.get<Pool>('DB_POOL');
  });

  afterAll(async () => {
    await app.close();
  });

  describe('EntriesService - Draft Creation', () => {
    it('should create a draft entry with lines', async () => {
      const createEntryDto: CreateEntryDto = {
        entry_date: '2026-05-06',
        description: 'Test Entry',
        lines: [
          {
            account_id: mockAccountId1,
            debit: 100,
            description: 'Debit line',
          },
          {
            account_id: mockAccountId2,
            credit: 100,
            description: 'Credit line',
          },
        ],
      };

      const mockEntry = {
        id: '550e8400-e29b-41d4-a716-446655440100',
        tenant_id: mockTenantId,
        entry_date: '2026-05-06',
        description: 'Test Entry',
        posted_at: null,
        posted_by: null,
        is_reversed: false,
        reversal_of: null,
        created_at: new Date(),
      };

      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce(undefined) // BEGIN
          .mockResolvedValueOnce(undefined) // SET LOCAL
          .mockResolvedValueOnce({ rows: [mockEntry] }) // INSERT entry
          .mockResolvedValueOnce({ rows: [{ id: mockAccountId1 }] }) // Check account 1
          .mockResolvedValueOnce({ rows: [{ id: '550e8400-e29b-41d4-a716-446655440101', entry_id: mockEntry.id, account_id: mockAccountId1, debit: 100, credit: null, line_order: 1, created_at: new Date() }] }) // INSERT line 1
          .mockResolvedValueOnce({ rows: [{ id: mockAccountId2 }] }) // Check account 2
          .mockResolvedValueOnce({ rows: [{ id: '550e8400-e29b-41d4-a716-446655440102', entry_id: mockEntry.id, account_id: mockAccountId2, debit: null, credit: 100, line_order: 2, created_at: new Date() }] }) // INSERT line 2
          .mockResolvedValueOnce(undefined), // COMMIT
        release: jest.fn(),
      };

      (pool.connect as jest.Mock).mockResolvedValue(mockClient);

      const mockRequest = { user: { tenant_id: mockTenantId } };
      Object.defineProperty(service, 'request', {
        value: mockRequest,
        writable: true,
      });

      const result = await service.create(createEntryDto);

      expect(result).toBeDefined();
      expect(result.status).toBe('DRAFT');
      expect(result.lines).toHaveLength(2);
    });

    it('should reject entry with both debit and credit on same line', async () => {
      const createEntryDto: CreateEntryDto = {
        entry_date: '2026-05-06',
        lines: [
          {
            account_id: mockAccountId1,
            debit: 100,
            credit: 50,
          },
        ],
      };

      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce(undefined) // BEGIN
          .mockResolvedValueOnce(undefined) // SET LOCAL
          .mockResolvedValueOnce({ rows: [{ id: '550e8400-e29b-41d4-a716-446655440100' }] }) // INSERT entry
          .mockResolvedValueOnce(undefined), // ROLLBACK
        release: jest.fn(),
      };

      (pool.connect as jest.Mock).mockResolvedValue(mockClient);

      const mockRequest = { user: { tenant_id: mockTenantId } };
      Object.defineProperty(service, 'request', {
        value: mockRequest,
        writable: true,
      });

      await expect(service.create(createEntryDto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('EntriesService - Posting Workflow', () => {
    it('should post a balanced entry', async () => {
      const entryId = '550e8400-e29b-41d4-a716-446655440100';

      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce(undefined) // BEGIN
          .mockResolvedValueOnce(undefined) // SET LOCAL
          .mockResolvedValueOnce({ rows: [{ id: entryId, posted_at: null }] }) // Check entry
          .mockResolvedValueOnce({ rows: [{ total_debit: 100, total_credit: 100 }] }) // Balance check
          .mockResolvedValueOnce({ rows: [{ id: entryId, posted_at: new Date(), posted_by: mockUserId }] }) // Update entry
          .mockResolvedValueOnce(undefined) // COMMIT
          .mockResolvedValueOnce(undefined) // SET LOCAL (for findOne)
          .mockResolvedValueOnce({ rows: [{ id: entryId, posted_at: new Date(), status: 'POSTED' }] }) // SELECT entry
          .mockResolvedValueOnce({ rows: [] }), // SELECT lines
        release: jest.fn(),
      };

      (pool.connect as jest.Mock).mockResolvedValue(mockClient);

      const mockRequest = { user: { tenant_id: mockTenantId, id: mockUserId } };
      Object.defineProperty(service, 'request', {
        value: mockRequest,
        writable: true,
      });

      const result = await service.post(entryId);

      expect(result).toBeDefined();
      expect(result.status).toBe('POSTED');
    });

    it('should reject posting unbalanced entry', async () => {
      const entryId = '550e8400-e29b-41d4-a716-446655440100';

      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce(undefined) // BEGIN
          .mockResolvedValueOnce(undefined) // SET LOCAL
          .mockResolvedValueOnce({ rows: [{ id: entryId, posted_at: null }] }) // Check entry
          .mockResolvedValueOnce({ rows: [{ total_debit: 100, total_credit: 50 }] }) // Balance check fails
          .mockResolvedValueOnce(undefined), // ROLLBACK
        release: jest.fn(),
      };

      (pool.connect as jest.Mock).mockResolvedValue(mockClient);

      const mockRequest = { user: { tenant_id: mockTenantId, id: mockUserId } };
      Object.defineProperty(service, 'request', {
        value: mockRequest,
        writable: true,
      });

      await expect(service.post(entryId)).rejects.toThrow(BadRequestException);
    });
  });

  describe('EntriesService - Reversal Workflow', () => {
    it('should reverse a posted entry', async () => {
      const entryId = '550e8400-e29b-41d4-a716-446655440100';
      const reversalEntryId = '550e8400-e29b-41d4-a716-446655440101';

      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce(undefined) // BEGIN
          .mockResolvedValueOnce(undefined) // SET LOCAL
          .mockResolvedValueOnce({ rows: [{ id: entryId, posted_at: new Date(), description: 'Original' }] }) // Check original
          .mockResolvedValueOnce({ rows: [{ id: reversalEntryId }] }) // Create reversal entry
          .mockResolvedValueOnce({ rows: [{ account_id: mockAccountId1, debit: 100, credit: null, line_order: 1, description: 'Line 1' }] }) // Get original lines
          .mockResolvedValueOnce(undefined) // INSERT reversed line 1
          .mockResolvedValueOnce(undefined) // INSERT reversed line 2
          .mockResolvedValueOnce(undefined) // UPDATE reversal to posted
          .mockResolvedValueOnce(undefined) // UPDATE original as reversed
          .mockResolvedValueOnce(undefined) // COMMIT
          .mockResolvedValueOnce(undefined) // SET LOCAL (for findOne)
          .mockResolvedValueOnce({ rows: [{ id: reversalEntryId, posted_at: new Date(), status: 'POSTED' }] }) // SELECT reversal entry
          .mockResolvedValueOnce({ rows: [] }), // SELECT reversal lines
        release: jest.fn(),
      };

      (pool.connect as jest.Mock).mockResolvedValue(mockClient);

      const mockRequest = { user: { tenant_id: mockTenantId, id: mockUserId } };
      Object.defineProperty(service, 'request', {
        value: mockRequest,
        writable: true,
      });

      const result = await service.reverse(entryId);

      expect(result).toBeDefined();
      expect(result.status).toBe('POSTED');
    });

    it('should not allow reversing draft entry', async () => {
      const entryId = '550e8400-e29b-41d4-a716-446655440100';

      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce(undefined) // BEGIN
          .mockResolvedValueOnce(undefined) // SET LOCAL
          .mockResolvedValueOnce({ rows: [{ id: entryId, posted_at: null }] }) // Check entry - not posted
          .mockResolvedValueOnce(undefined), // ROLLBACK
        release: jest.fn(),
      };

      (pool.connect as jest.Mock).mockResolvedValue(mockClient);

      const mockRequest = { user: { tenant_id: mockTenantId, id: mockUserId } };
      Object.defineProperty(service, 'request', {
        value: mockRequest,
        writable: true,
      });

      await expect(service.reverse(entryId)).rejects.toThrow(BadRequestException);
    });
  });

  describe('EntryLinesService - Line Operations', () => {
    it('should add line to draft entry', async () => {
      const entryId = '550e8400-e29b-41d4-a716-446655440100';
      const lineDto: CreateEntryLineDto = {
        account_id: mockAccountId1,
        debit: 50,
        description: 'New line',
      };

      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce(undefined) // BEGIN
          .mockResolvedValueOnce(undefined) // SET LOCAL
          .mockResolvedValueOnce({ rows: [{ id: entryId, posted_at: null }] }) // Check entry
          .mockResolvedValueOnce({ rows: [{ id: mockAccountId1 }] }) // Check account
          .mockResolvedValueOnce({ rows: [{ max_order: 1 }] }) // Get max line_order
          .mockResolvedValueOnce({ rows: [{ id: '550e8400-e29b-41d4-a716-446655440102', account_id: mockAccountId1, debit: 50, credit: null, line_order: 2, created_at: new Date() }] }) // INSERT line
          .mockResolvedValueOnce(undefined), // COMMIT
        release: jest.fn(),
      };

      (pool.connect as jest.Mock).mockResolvedValue(mockClient);

      const mockRequest = { user: { tenant_id: mockTenantId } };
      Object.defineProperty(linesService, 'request', {
        value: mockRequest,
        writable: true,
      });

      const result = await linesService.addLine(entryId, lineDto);

      expect(result).toBeDefined();
      expect(result.account_id).toBe(mockAccountId1);
      expect(result.debit).toBe(50);
    });

    it('should not allow editing lines in posted entry', async () => {
      const entryId = '550e8400-e29b-41d4-a716-446655440100';
      const lineId = '550e8400-e29b-41d4-a716-446655440102';
      const lineDto: CreateEntryLineDto = {
        account_id: mockAccountId2,
        debit: 75,
      };

      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce(undefined) // BEGIN
          .mockResolvedValueOnce(undefined) // SET LOCAL
          .mockResolvedValueOnce({ rows: [{ posted_at: new Date() }] }) // Check entry - posted
          .mockResolvedValueOnce(undefined), // ROLLBACK
        release: jest.fn(),
      };

      (pool.connect as jest.Mock).mockResolvedValue(mockClient);

      const mockRequest = { user: { tenant_id: mockTenantId } };
      Object.defineProperty(linesService, 'request', {
        value: mockRequest,
        writable: true,
      });

      await expect(linesService.editLine(entryId, lineId, lineDto)).rejects.toThrow(ConflictException);
    });
  });

  describe('Account Details in Response', () => {
    it('should include account details (code, name) in line response', async () => {
      const entryId = '550e8400-e29b-41d4-a716-446655440100';

      const mockAccount = {
        id: mockAccountId1,
        code: '1000',
        name: 'Cash',
      };

      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce(undefined) // SET LOCAL
          .mockResolvedValueOnce({ rows: [{ id: entryId, posted_at: null, status: 'DRAFT' }] }) // SELECT entry
          .mockResolvedValueOnce({
            rows: [{
              id: 'line-1',
              entry_id: entryId,
              account_id: mockAccountId1,
              description: 'Test line',
              debit: 100,
              credit: null,
              line_order: 1,
              created_at: new Date(),
              account: mockAccount,
            }],
          }), // SELECT lines with account details
        release: jest.fn(),
      };

      (pool.connect as jest.Mock).mockResolvedValue(mockClient);

      const mockRequest = { user: { tenant_id: mockTenantId } };
      Object.defineProperty(service, 'request', {
        value: mockRequest,
        writable: true,
      });

      const result = await service.findOne(entryId);

      expect(result.lines).toBeDefined();
      if (result.lines && result.lines[0]) {
        const account = result.lines[0].account;
        expect(account).toBeDefined();
        if (account) {
          expect(account.code).toBe('1000');
          expect(account.name).toBe('Cash');
        }
      }
    });
  });

  describe('RLS & Tenant Isolation', () => {
    it('should enforce tenant isolation on entry creation', async () => {
      const createEntryDto: CreateEntryDto = {
        entry_date: '2026-05-06',
      };

      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce(undefined) // BEGIN
          .mockResolvedValueOnce(undefined) // SET LOCAL
          .mockResolvedValueOnce({ rows: [{ id: 'entry-1' }] }) // INSERT
          .mockResolvedValueOnce(undefined), // COMMIT
        release: jest.fn(),
      };

      (pool.connect as jest.Mock).mockResolvedValue(mockClient);

      const mockRequest = { user: { tenant_id: mockTenantId } };
      Object.defineProperty(service, 'request', {
        value: mockRequest,
        writable: true,
      });

      await service.create(createEntryDto);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('SET LOCAL'),
        [mockTenantId],
      );
    });
  });
});
