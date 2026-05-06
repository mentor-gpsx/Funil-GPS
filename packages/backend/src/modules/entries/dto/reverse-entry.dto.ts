import { IsOptional, IsString, Length } from 'class-validator';

export class ReverseEntryDto {
  @IsOptional()
  @IsString()
  @Length(1, 500)
  reversal_reason?: string;
}
