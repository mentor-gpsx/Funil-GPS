import { Exclude } from 'class-transformer';
import { AccountType } from './create-account.dto';

export class AccountResponseDto {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  account_type: AccountType;
  parent_id: string | null;
  is_active: boolean;
  created_at?: Date;
  updated_at?: Date;

  @Exclude()
  password?: string;
}
