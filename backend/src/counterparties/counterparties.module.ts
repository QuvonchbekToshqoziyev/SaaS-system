import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CounterpartiesController } from './counterparties.controller';
import { CounterpartiesService } from './counterparties.service';
import { Counterparty } from '../entities';

@Module({
  imports: [TypeOrmModule.forFeature([Counterparty])],
  controllers: [CounterpartiesController],
  providers: [CounterpartiesService],
  exports: [CounterpartiesService],
})
export class CounterpartiesModule {}
