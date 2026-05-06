import { Exclude, Type } from 'class-transformer';

export class AccountDetailDto {
  id: string;
  code: string;
  name: string;
}

export class EntryLineResponseDto {
  id: string;
  entry_id: string;
  account_id: string;
  @Type(() => AccountDetailDto)
  account?: AccountDetailDto;
  description?: string;
  debit?: number;
  credit?: number;
  line_order: number;
  created_at: Date;
}

export class EntryResponseDto {
  id: string;
  tenant_id: string;
  entry_date: string;
  description?: string;
  posted_at?: Date;
  posted_by?: string;
  is_reversed: boolean;
  reversal_of?: string;
  created_at: Date;
  status: 'DRAFT' | 'POSTED';

  @Type(() => EntryLineResponseDto)
  lines?: EntryLineResponseDto[];
}
