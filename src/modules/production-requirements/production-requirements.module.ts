import { Module } from '@nestjs/common';
import { ProductionRequirementsController } from './production-requirements.controller';
import { ProductionRequirementsService } from './production-requirements.service';

@Module({
  controllers: [ProductionRequirementsController],
  providers: [ProductionRequirementsService],
  exports: [ProductionRequirementsService],
})
export class ProductionRequirementsModule {}
