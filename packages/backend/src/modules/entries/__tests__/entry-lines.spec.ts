import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';
import { EntryLinesService } from '../entry-lines.service';
import { CreateEntryLineDto } from '../dto/create-entry.dto';

describe('EntryLinesService', () => {
  let app: INestApplication;
  let service: EntryLinesService;
  let pool: Pool;

  const mockTenantId = '550e8400-e29b-41d4-a716-446655440001';
  const mockAccountId1 = '550e8400-e29b-41d4-a716-446655440010';
  const mockAccountId2 = '550e8400-e29b-41d4-a716-446655440011';
  const mockEntryId = '550e8400-e29b-41d4-a716-446655440100';
  const mockLineId = '550e8400-e29b-41d4-a716-446655440102';

  beforeAll(async () => {
    const mockPool = {
      connect: jest.fn(),
      query: jest.fn(),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      providers: [
        EntryLinesService,
        {
          provide: 'DB_POOL',
          useValue: mockPool,
        },
        {
          provide: 'REQUEST',
          useValue: { user: { tenant_id: mockTenantId } },
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    service = moduleFixture.get<EntryLinesService>(EntryLinesService);
    pool = moduleFixture.get<Pool>('DB_POOL');
  });

  afterAll(async () => {
    await app.close();
  });

  describe('addLine', () => {
    it('should add debit line to draft entry', async () => {
      const lineDto: CreateEntryLineDto = {
        account_id: mockAccountId1,
        debit: 100,
        description: 'Test debit',
      };

      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce(undefined) // BEGIN
          .mockResolvedValueOnce(undefined) // SET LOCAL
          .mockResolvedValueOnce({ rows: [{ id: mockEntryId, posted_at: null }] }) // Check entry
          .mockResolvedValueOnce({ rows: [{ id: mockAccountId1 }] }) // Check account
          .mockResolvedValueOnce({ rows: [{ max_order: 0 }] }) // Get max line_order
          .mockResolvedValueOnce({
            rows: [{
              id: mockLineId,
              entry_id: mockEntryId,
              account_id: mockAccountId1,
              debit: 100,
              credit: null,
              line_order: 1,
              created_at: new Date(),
            }],
          }) // INSERT line
          .mockResolvedValueOnce(undefined), // COMMIT
        release: jest.fn(),
      };

      (pool.connect as jest.Mock).mockResolvedValue(mockClient);

      const mockRequest = { user: { tenant_id: mockTenantId } };
      Object.defineProperty(service, 'request', {
        value: mockRequest,
        writable: true,
      });

      const result = await service.addLine(mockEntryId, lineDto);

      expect(result).toBeDefined();
      expect(result.debit).toBe(100);
      expect(result.credit).toBeNull();
      expect(result.line_order).toBe(1);
    });

    it('should reject line with both debit and credit', async () => {
      const lineDto: CreateEntryLineDto = {
        account_id: mockAccountId1,
        debit: 100,
        credit: 50,
      };

      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce(undefined) // BEGIN
          .mockResolvedValueOnce(undefined) // SET LOCAL
          .mockResolvedValueOnce({ rows: [{ id: mockEntryId, posted_at: null }] }) // Check entry
          .mockResolvedValueOnce(undefined), // ROLLBACK
        release: jest.fn(),
      };

      (pool.connect as jest.Mock).mockResolvedValue(mockClient);

      const mockRequest = { user: { tenant_id: mockTenantId } };
      Object.defineProperty(service, 'request', {
        value: mockRequest,
        writable: true,
      });

      await expect(service.addLine(mockEntryId, lineDto)).rejects.toThrow(BadRequestException);
    });

    it('should not allow adding lines to posted entry', async () => {
      const lineDto: CreateEntryLineDto = {
        account_id: mockAccountId1,
        debit: 100,
      };

      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce(undefined) // BEGIN
          .mockResolvedValueOnce(undefined) // SET LOCAL
          .mockResolvedValueOnce({ rows: [{ id: mockEntryId, posted_at: new Date() }] }) // Check entry - posted
          .mockResolvedValueOnce(undefined), // ROLLBACK
        release: jest.fn(),
      };

      (pool.connect as jest.Mock).mockResolvedValue(mockClient);

      const mockRequest = { user: { tenant_id: mockTenantId } };
      Object.defineProperty(service, 'request', {
        value: mockRequest,
        writable: true,
      });

      await expect(service.addLine(mockEntryId, lineDto)).rejects.toThrow(ConflictException);
    });
  });

  describe('editLine', () => {
    it('should edit line in draft entry', async () => {
      const lineDto: CreateEntryLineDto = {
        account_id: mockAccountId2,
        credit: 150,
      };

      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce(undefined) // BEGIN
          .mockResolvedValueOnce(undefined) // SET LOCAL
          .mockResolvedValueOnce({ rows: [{ posted_at: null }] }) // Check entry
          .mockResolvedValueOnce({ rows: [{ id: mockLineId }] }) // Check line exists
          .mockResolvedValueOnce({ rows: [{ id: mockAccountId2 }] }) // Check account
          .mockResolvedValueOnce({
            rows: [{
              id: mockLineId,
              entry_id: mockEntryId,
              account_id: mockAccountId2,
              debit: null,
              credit: 150,
              line_order: 1,
              created_at: new Date(),
            }],
          }) // UPDATE line
          .mockResolvedValueOnce(undefined), // COMMIT
        release: jest.fn(),
      };

      (pool.connect as jest.Mock).mockResolvedValue(mockClient);

      const mockRequest = { user: { tenant_id: mockTenantId } };
      Object.defineProperty(service, 'request', {
        value: mockRequest,
        writable: true,
      });

      const result = await service.editLine(mockEntryId, mockLineId, lineDto);

      expect(result).toBeDefined();
      expect(result.credit).toBe(150);
      expect(result.debit).toBeNull();
    });

    it('should not allow editing lines in posted entry', async () => {
      const lineDto: CreateEntryLineDto = {
        account_id: mockAccountId1,
        debit: 200,
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
      Object.defineProperty(service, 'request', {
        value: mockRequest,
        writable: true,
      });

      await expect(service.editLine(mockEntryId, mockLineId, lineDto)).rejects.toThrow(ConflictException);
    });
  });

  describe('deleteLine', () => {
    it('should delete line from draft entry', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce(undefined) // BEGIN
          .mockResolvedValueOnce(undefined) // SET LOCAL
          .mockResolvedValueOnce({ rows: [{ posted_at: null }] }) // Check entry
          .mockResolvedValueOnce({ rows: [{ id: mockLineId }] }) // DELETE
          .mockResolvedValueOnce(undefined), // COMMIT
        release: jest.fn(),
      };

      (pool.connect as jest.Mock).mockResolvedValue(mockClient);

      const mockRequest = { user: { tenant_id: mockTenantId } };
      Object.defineProperty(service, 'request', {
        value: mockRequest,
        writable: true,
      });

      await expect(service.deleteLine(mockEntryId, mockLineId)).resolves.toBeUndefined();
    });

    it('should not allow deleting lines from posted entry', async () => {
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
      Object.defineProperty(service, 'request', {
        value: mockRequest,
        writable: true,
      });

      await expect(service.deleteLine(mockEntryId, mockLineId)).rejects.toThrow(ConflictException);
    });
  });

  describe('getLinesByEntry', () => {
    it('should return all lines for an entry ordered by line_order', async () => {
      const mockLines = [
        {
          id: '550e8400-e29b-41d4-a716-446655440102',
          entry_id: mockEntryId,
          account_id: mockAccountId1,
          debit: 100,
          credit: null,
          line_order: 1,
          created_at: new Date(),
        },
        {
          id: '550e8400-e29b-41d4-a716-446655440103',
          entry_id: mockEntryId,
          account_id: mockAccountId2,
          debit: null,
          credit: 100,
          line_order: 2,
          created_at: new Date(),
        },
      ];

      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce(undefined) // SET LOCAL
          .mockResolvedValueOnce({ rows: mockLines }), // SELECT
        release: jest.fn(),
      };

      (pool.connect as jest.Mock).mockResolvedValue(mockClient);

      const mockRequest = { user: { tenant_id: mockTenantId } };
      Object.defineProperty(service, 'request', {
        value: mockRequest,
        writable: true,
      });

      const result = await service.getLinesByEntry(mockEntryId);

      expect(result).toHaveLength(2);
      expect(result[0].line_order).toBe(1);
      expect(result[1].line_order).toBe(2);
    });
  });

  describe('RLS & Tenant Isolation', () => {
    it('should enforce tenant isolation when adding lines', async () => {
      const lineDto: CreateEntryLineDto = {
        account_id: mockAccountId1,
        debit: 100,
      };

      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce(undefined) // BEGIN
          .mockResolvedValueOnce(undefined) // SET LOCAL
          .mockResolvedValueOnce({ rows: [{ id: mockEntryId, posted_at: null }] }) // Check entry
          .mockResolvedValueOnce({ rows: [{ id: mockAccountId1 }] }) // Check account
          .mockResolvedValueOnce({ rows: [{ max_order: 0 }] }) // Get max line_order
          .mockResolvedValueOnce({ rows: [{ id: mockLineId }] }) // INSERT
          .mockResolvedValueOnce(undefined), // COMMIT
        release: jest.fn(),
      };

      (pool.connect as jest.Mock).mockResolvedValue(mockClient);

      const mockRequest = { user: { tenant_id: mockTenantId } };
      Object.defineProperty(service, 'request', {
        value: mockRequest,
        writable: true,
      });

      await service.addLine(mockEntryId, lineDto);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('SET LOCAL'),
        [mockTenantId],
      );
    });
  });
});
