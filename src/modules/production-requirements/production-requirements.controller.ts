import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import { ProductionRequirementsService } from './production-requirements.service';
import { CreateProductionRequirementDto } from './dto/create-production-requirement.dto';
import { ParseDatePipe } from '../../common/pipes/parse-date.pipe';

@Controller('production-requirements')
export class ProductionRequirementsController {
  constructor(
    private readonly productionRequirementsService: ProductionRequirementsService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateProductionRequirementDto) {
    return this.productionRequirementsService.upsert(dto);
  }

  @Get()
  findByDate(@Query('date', ParseDatePipe) date: string) {
    return this.productionRequirementsService.findByDate(date);
  }
}
