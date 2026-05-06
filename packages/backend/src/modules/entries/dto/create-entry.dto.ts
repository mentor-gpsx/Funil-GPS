import { IsISO8601, IsString, IsOptional, IsArray, ValidateNested, Length } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateEntryLineDto {
  @IsString()
  account_id: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  debit?: number;

  @IsOptional()
  credit?: number;

  line_order?: number;
}

export class CreateEntryDto {
  @IsISO8601()
  entry_date: string;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  description?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateEntryLineDto)
  lines?: CreateEntryLineDto[];
}
