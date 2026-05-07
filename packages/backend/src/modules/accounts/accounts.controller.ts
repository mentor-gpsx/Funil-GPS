import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountsService } from './accounts.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { AccountResponseDto } from './dto/account-response.dto';

@Controller('api/accounts')
@UseGuards(JwtAuthGuard)
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body(new ValidationPipe({ transform: true })) createAccountDto: CreateAccountDto,
  ): Promise<AccountResponseDto> {
    return this.accountsService.create(createAccountDto);
  }

  @Get()
  async findAll(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 50,
    @Query('search') search?: string,
  ): Promise<{ data: AccountResponseDto[]; total: number; page: number; limit: number }> {
    const result = await this.accountsService.findAll(page, limit, search);
    return {
      ...result,
      page,
      limit,
    };
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<AccountResponseDto> {
    return this.accountsService.findOne(id);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body(new ValidationPipe({ transform: true })) updateAccountDto: UpdateAccountDto,
  ): Promise<AccountResponseDto> {
    return this.accountsService.update(id, updateAccountDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string): Promise<void> {
    return this.accountsService.remove(id);
  }
}
