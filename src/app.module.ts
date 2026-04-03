import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { SkillsModule } from './modules/skills/skills.module';
import { EmployeesModule } from './modules/employees/employees.module';
import { PartsModule } from './modules/parts/parts.module';
import { ProductionRequirementsModule } from './modules/production-requirements/production-requirements.module';
import { SchedulerModule } from './modules/scheduler/scheduler.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    SkillsModule,
    EmployeesModule,
    PartsModule,
    ProductionRequirementsModule,
    SchedulerModule,
  ],
})
export class AppModule {}
