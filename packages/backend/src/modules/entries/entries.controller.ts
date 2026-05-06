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
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { EntriesService } from './entries.service';
import { EntryLinesService } from './entry-lines.service';
import { CreateEntryDto, CreateEntryLineDto } from './dto/create-entry.dto';
import { PostEntryDto } from './dto/post-entry.dto';
import { ReverseEntryDto } from './dto/reverse-entry.dto';
import { EntryResponseDto, EntryLineResponseDto } from './dto/entry-response.dto';

@Controller('api/entries')
@UseGuards(JwtAuthGuard)
export class EntriesController {
  constructor(
    private readonly entriesService: EntriesService,
    private readonly linesService: EntryLinesService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body(new ValidationPipe({ transform: true })) createEntryDto: CreateEntryDto,
  ): Promise<EntryResponseDto> {
    return this.entriesService.create(createEntryDto);
  }

  @Get()
  async findAll(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 50,
    @Query('status') status?: 'DRAFT' | 'POSTED',
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ): Promise<{ data: EntryResponseDto[]; total: number; page: number; limit: number }> {
    const result = await this.entriesService.findAll(page, limit, status, dateFrom, dateTo);
    return {
      ...result,
      page,
      limit,
    };
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<EntryResponseDto> {
    return this.entriesService.findOne(id);
  }

  @Post(':id/post')
  @HttpCode(HttpStatus.OK)
  async post(
    @Param('id') id: string,
    @Body(new ValidationPipe({ transform: true })) _postEntryDto?: PostEntryDto,
  ): Promise<EntryResponseDto> {
    return this.entriesService.post(id);
  }

  @Post(':id/reverse')
  @HttpCode(HttpStatus.CREATED)
  async reverse(
    @Param('id') id: string,
    @Body(new ValidationPipe({ transform: true })) reverseEntryDto?: ReverseEntryDto,
  ): Promise<EntryResponseDto> {
    return this.entriesService.reverse(id, reverseEntryDto);
  }

  @Post(':id/lines')
  @HttpCode(HttpStatus.CREATED)
  async addLine(
    @Param('id') id: string,
    @Body(new ValidationPipe({ transform: true })) createLineDto: CreateEntryLineDto,
  ): Promise<EntryLineResponseDto> {
    return this.linesService.addLine(id, createLineDto);
  }

  @Patch(':id/lines/:lineId')
  async editLine(
    @Param('id') id: string,
    @Param('lineId') lineId: string,
    @Body(new ValidationPipe({ transform: true })) createLineDto: CreateEntryLineDto,
  ): Promise<EntryLineResponseDto> {
    return this.linesService.editLine(id, lineId, createLineDto);
  }

  @Delete(':id/lines/:lineId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteLine(@Param('id') id: string, @Param('lineId') lineId: string): Promise<void> {
    return this.linesService.deleteLine(id, lineId);
  }
}
