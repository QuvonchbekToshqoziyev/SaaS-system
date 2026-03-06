import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { Transaction, Counterparty, Employee, InventoryItem, Company } from '../entities';

@Module({
  imports: [
    TypeOrmModule.forFeature([Transaction, Counterparty, Employee, InventoryItem, Company]),
  ],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
