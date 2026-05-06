import { IsString, IsEnum, IsOptional, IsUUID, Length, MaxLength } from 'class-validator';

export enum AccountType {
  ASSET = 'asset',
  LIABILITY = 'liability',
  EQUITY = 'equity',
  REVENUE = 'revenue',
  EXPENSE = 'expense',
}

export class CreateAccountDto {
  @IsString()
  @Length(1, 20)
  code: string;

  @IsString()
  @MaxLength(255)
  name: string;

  @IsEnum(AccountType)
  account_type: AccountType;

  @IsOptional()
  @IsUUID()
  parent_id?: string;
}
