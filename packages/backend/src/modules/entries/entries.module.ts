import { Module } from '@nestjs/common';
import { EntriesController } from './entries.controller';
import { EntriesService } from './entries.service';
import { EntryLinesService } from './entry-lines.service';

@Module({
  controllers: [EntriesController],
  providers: [EntriesService, EntryLinesService],
  exports: [EntriesService, EntryLinesService],
})
export class EntriesModule {}
