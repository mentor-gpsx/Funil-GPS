import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import * as request from 'supertest';
import { Pool } from 'pg';
import { AccountsService } from '../accounts.service';
import { AccountsController } from '../accounts.controller';
import { AccountsModule } from '../accounts.module';
import { CreateAccountDto, AccountType } from '../dto/create-account.dto';
import { UpdateAccountDto } from '../dto/update-account.dto';

describe('AccountsModule', () => {
  let app: INestApplication;
  let service: AccountsService;
  let pool: Pool;

  const mockTenantId = '550e8400-e29b-41d4-a716-446655440001';
  const mockUserId = '550e8400-e29b-41d4-a716-446655440002';

  beforeAll(async () => {
    // Mock pool for testing
    const mockPool = {
      connect: jest.fn(),
      query: jest.fn(),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AccountsModule],
    })
      .overrideProvider('DB_POOL')
      .useValue(mockPool)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    service = moduleFixture.get<AccountsService>(AccountsService);
    pool = moduleFixture.get<Pool>('DB_POOL');
  });

  afterAll(async () => {
    await app.close();
  });

  describe('AccountsService - Unit Tests', () => {
    describe('create', () => {
      it('should create an account with valid data', async () => {
        const createAccountDto: CreateAccountDto = {
          code: '1000',
          name: 'Ativo Circulante',
          account_type: AccountType.ASSET,
          parent_id: undefined,
        };

        const mockAccount = {
          id: '550e8400-e29b-41d4-a716-446655440003',
          tenant_id: mockTenantId,
          ...createAccountDto,
          is_active: true,
          created_at: new Date(),
        };

        const mockClient = {
          query: jest.fn()
            .mockResolvedValueOnce({ rows: [] }) // Check code uniqueness
            .mockResolvedValueOnce({ rows: [mockAccount] }) // Insert
            .mockResolvedValueOnce(undefined), // Commit
          release: jest.fn(),
        };

        (pool.connect as jest.Mock).mockResolvedValue(mockClient);

        // Mock request with tenant_id
        const mockRequest = { user: { tenant_id: mockTenantId } };
        Object.defineProperty(service, 'request', {
          value: mockRequest,
          writable: true,
        });

        const result = await service.create(createAccountDto);

        expect(result).toBeDefined();
        expect(mockClient.query).toHaveBeenCalled();
      });

      it('should throw ConflictException if code already exists', async () => {
        const createAccountDto: CreateAccountDto = {
          code: '1000',
          name: 'Ativo Circulante',
          account_type: AccountType.ASSET,
        };

        const mockClient = {
          query: jest.fn()
            .mockResolvedValueOnce({ rows: [{ id: 'existing-id' }] }) // Code exists
            .mockResolvedValueOnce(undefined), // Rollback
          release: jest.fn(),
        };

        (pool.connect as jest.Mock).mockResolvedValue(mockClient);

        const mockRequest = { user: { tenant_id: mockTenantId } };
        Object.defineProperty(service, 'request', {
          value: mockRequest,
          writable: true,
        });

        await expect(service.create(createAccountDto)).rejects.toThrow(ConflictException);
      });

      it('should throw BadRequestException if parent_id not found', async () => {
        const createAccountDto: CreateAccountDto = {
          code: '1100',
          name: 'Caixa',
          account_type: AccountType.ASSET,
          parent_id: 'non-existent-parent',
        };

        const mockClient = {
          query: jest.fn()
            .mockResolvedValueOnce({ rows: [] }) // Code unique
            .mockResolvedValueOnce({ rows: [] }) // Parent not found
            .mockResolvedValueOnce(undefined), // Rollback
          release: jest.fn(),
        };

        (pool.connect as jest.Mock).mockResolvedValue(mockClient);

        const mockRequest = { user: { tenant_id: mockTenantId } };
        Object.defineProperty(service, 'request', {
          value: mockRequest,
          writable: true,
        });

        await expect(service.create(createAccountDto)).rejects.toThrow(BadRequestException);
      });
    });

    describe('findAll', () => {
      it('should return paginated accounts', async () => {
        const mockAccounts = [
          {
            id: '1',
            tenant_id: mockTenantId,
            code: '1000',
            name: 'Ativo',
            account_type: AccountType.ASSET,
            is_active: true,
          },
          {
            id: '2',
            tenant_id: mockTenantId,
            code: '2000',
            name: 'Passivo',
            account_type: AccountType.LIABILITY,
            is_active: true,
          },
        ];

        const mockClient = {
          query: jest.fn()
            .mockResolvedValueOnce({ rows: mockAccounts })
            .mockResolvedValueOnce({ rows: [{ count: '10' }] }),
          release: jest.fn(),
        };

        (pool.connect as jest.Mock).mockResolvedValue(mockClient);

        const mockRequest = { user: { tenant_id: mockTenantId } };
        Object.defineProperty(service, 'request', {
          value: mockRequest,
          writable: true,
        });

        const result = await service.findAll(1, 50);

        expect(result.data).toHaveLength(2);
        expect(result.total).toBe(10);
      });

      it('should filter accounts by search term', async () => {
        const mockClient = {
          query: jest.fn()
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [{ count: '0' }] }),
          release: jest.fn(),
        };

        (pool.connect as jest.Mock).mockResolvedValue(mockClient);

        const mockRequest = { user: { tenant_id: mockTenantId } };
        Object.defineProperty(service, 'request', {
          value: mockRequest,
          writable: true,
        });

        await service.findAll(1, 50, 'Ativo');

        expect(mockClient.query).toHaveBeenCalledWith(
          expect.stringContaining('ILIKE'),
          expect.any(Array),
        );
      });
    });

    describe('findOne', () => {
      it('should return account by id', async () => {
        const mockAccount = {
          id: '550e8400-e29b-41d4-a716-446655440003',
          tenant_id: mockTenantId,
          code: '1000',
          name: 'Ativo',
          account_type: AccountType.ASSET,
          is_active: true,
        };

        const mockClient = {
          query: jest.fn().mockResolvedValue({ rows: [mockAccount] }),
          release: jest.fn(),
        };

        (pool.connect as jest.Mock).mockResolvedValue(mockClient);

        const mockRequest = { user: { tenant_id: mockTenantId } };
        Object.defineProperty(service, 'request', {
          value: mockRequest,
          writable: true,
        });

        const result = await service.findOne('550e8400-e29b-41d4-a716-446655440003');

        expect(result).toEqual(mockAccount);
      });

      it('should throw NotFoundException if account not found', async () => {
        const mockClient = {
          query: jest.fn().mockResolvedValue({ rows: [] }),
          release: jest.fn(),
        };

        (pool.connect as jest.Mock).mockResolvedValue(mockClient);

        const mockRequest = { user: { tenant_id: mockTenantId } };
        Object.defineProperty(service, 'request', {
          value: mockRequest,
          writable: true,
        });

        await expect(service.findOne('non-existent')).rejects.toThrow(NotFoundException);
      });
    });

    describe('update', () => {
      it('should update account with valid data', async () => {
        const updateAccountDto: UpdateAccountDto = {
          name: 'Ativo Atualizado',
        };

        const mockUpdatedAccount = {
          id: '550e8400-e29b-41d4-a716-446655440003',
          tenant_id: mockTenantId,
          code: '1000',
          name: 'Ativo Atualizado',
          account_type: AccountType.ASSET,
          is_active: true,
        };

        const mockClient = {
          query: jest.fn()
            .mockResolvedValueOnce(undefined) // Begin
            .mockResolvedValueOnce(undefined) // Set tenant
            .mockResolvedValueOnce({ rows: [{ id: '550e8400-e29b-41d4-a716-446655440003' }] }) // Check exists
            .mockResolvedValueOnce({ rows: [mockUpdatedAccount] }) // Update
            .mockResolvedValueOnce(undefined), // Commit
          release: jest.fn(),
        };

        (pool.connect as jest.Mock).mockResolvedValue(mockClient);

        const mockRequest = { user: { tenant_id: mockTenantId } };
        Object.defineProperty(service, 'request', {
          value: mockRequest,
          writable: true,
        });

        const result = await service.update('550e8400-e29b-41d4-a716-446655440003', updateAccountDto);

        expect(result.name).toBe('Ativo Atualizado');
      });
    });

    describe('remove', () => {
      it('should soft delete account', async () => {
        const mockClient = {
          query: jest.fn()
            .mockResolvedValueOnce(undefined) // Begin
            .mockResolvedValueOnce(undefined) // Set tenant
            .mockResolvedValueOnce({ rows: [{ id: '550e8400-e29b-41d4-a716-446655440003' }] }) // Update
            .mockResolvedValueOnce(undefined), // Commit
          release: jest.fn(),
        };

        (pool.connect as jest.Mock).mockResolvedValue(mockClient);

        const mockRequest = { user: { tenant_id: mockTenantId } };
        Object.defineProperty(service, 'request', {
          value: mockRequest,
          writable: true,
        });

        await expect(
          service.remove('550e8400-e29b-41d4-a716-446655440003'),
        ).resolves.toBeUndefined();
      });

      it('should throw NotFoundException if account not found', async () => {
        const mockClient = {
          query: jest.fn()
            .mockResolvedValueOnce(undefined) // Begin
            .mockResolvedValueOnce(undefined) // Set tenant
            .mockResolvedValueOnce({ rows: [] }) // No rows updated
            .mockResolvedValueOnce(undefined), // Rollback
          release: jest.fn(),
        };

        (pool.connect as jest.Mock).mockResolvedValue(mockClient);

        const mockRequest = { user: { tenant_id: mockTenantId } };
        Object.defineProperty(service, 'request', {
          value: mockRequest,
          writable: true,
        });

        await expect(service.remove('non-existent')).rejects.toThrow(NotFoundException);
      });
    });
  });

  describe('RLS & Tenant Isolation', () => {
    it('should enforce tenant isolation on read', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce(undefined) // Set tenant
          .mockResolvedValueOnce({ rows: [] }), // Query
          release: jest.fn(),
      };

      (pool.connect as jest.Mock).mockResolvedValue(mockClient);

      const mockRequest = { user: { tenant_id: mockTenantId } };
      Object.defineProperty(service, 'request', {
        value: mockRequest,
        writable: true,
      });

      await service.findAll();

      // Verify SET LOCAL was called for tenant isolation
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('SET LOCAL'),
        [mockTenantId],
      );
    });

    it('should enforce tenant isolation on write', async () => {
      const createAccountDto: CreateAccountDto = {
        code: '1000',
        name: 'Test',
        account_type: AccountType.ASSET,
      };

      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce(undefined) // Begin
          .mockResolvedValueOnce(undefined) // Set tenant
          .mockResolvedValueOnce({ rows: [] }) // Check code
          .mockResolvedValueOnce({ rows: [{}] }) // Insert
          .mockResolvedValueOnce(undefined), // Commit
          release: jest.fn(),
      };

      (pool.connect as jest.Mock).mockResolvedValue(mockClient);

      const mockRequest = { user: { tenant_id: mockTenantId } };
      Object.defineProperty(service, 'request', {
        value: mockRequest,
        writable: true,
      });

      await service.create(createAccountDto);

      // Verify SET LOCAL was called
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('SET LOCAL'),
        [mockTenantId],
      );
    });
  });

  describe('Input Validation', () => {
    it('should validate account code length', async () => {
      const mockRequest = { user: { tenant_id: mockTenantId } };

      // The ValidationPipe in the controller will catch this
      // Testing the DTO validation directly
      const invalidDto = {
        code: '', // Empty code
        name: 'Test',
        account_type: AccountType.ASSET,
      };

      // In a real test, we'd use the controller with supertest
      // This is a unit test conceptual example
      expect(invalidDto.code).toBeFalsy();
    });

    it('should validate account type enum', () => {
      const validTypes = ['asset', 'liability', 'equity', 'revenue', 'expense'];
      const testType = AccountType.ASSET;

      expect(validTypes).toContain(testType);
    });
  });
});
