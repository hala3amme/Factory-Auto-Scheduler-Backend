import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { GenerateScheduleDto } from './dto/generate-schedule.dto';
import { ParseDatePipe } from '../../common/pipes/parse-date.pipe';

@Controller()
export class SchedulerController {
  constructor(private readonly schedulerService: SchedulerService) {}

  @Post('generate-schedule')
  @HttpCode(HttpStatus.OK)
  generateSchedule(@Body() dto: GenerateScheduleDto) {
    return this.schedulerService.generateSchedule(dto);
  }

  @Get('schedules/:date')
  async findByDate(@Param('date', ParseDatePipe) date: string) {
    const result = await this.schedulerService.findByDate(date);
    if (!result) {
      throw new NotFoundException(`No schedule found for date ${date}`);
    }
    return result;
  }
}
