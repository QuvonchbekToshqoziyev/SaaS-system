import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Counterparty } from '../entities';
import {
  CreateCounterpartyDto,
  UpdateCounterpartyDto,
} from './dto/counterparty.dto';

@Injectable()
export class CounterpartiesService {
  constructor(
    @InjectRepository(Counterparty)
    private cpRepo: Repository<Counterparty>,
  ) {}

  async create(dto: CreateCounterpartyDto) {
    const cp = this.cpRepo.create(dto);
    return this.cpRepo.save(cp);
  }

  async findAll(companyId: string) {
    return this.cpRepo.find({
      where: { companyId, isActive: true },
      relations: ['transactions'],
      order: { name: 'ASC' },
    });
  }

  async findOne(id: string) {
    const cp = await this.cpRepo.findOne({
      where: { id },
      relations: ['transactions'],
    });
    if (!cp) throw new NotFoundException('Counterparty not found');
    return cp;
  }

  async update(id: string, dto: UpdateCounterpartyDto) {
    const cp = await this.cpRepo.findOne({ where: { id } });
    if (!cp) throw new NotFoundException('Counterparty not found');
    Object.assign(cp, dto);
    return this.cpRepo.save(cp);
  }

  async deactivate(id: string) {
    const cp = await this.cpRepo.findOne({ where: { id } });
    if (!cp) throw new NotFoundException('Counterparty not found');
    cp.isActive = false;
    return this.cpRepo.save(cp);
  }

  async getDebtReport(companyId: string) {
    const counterparties = await this.cpRepo.find({
      where: { companyId, isActive: true },
      order: { debtBalance: 'DESC' },
    });

    const totalDebt = counterparties.reduce(
      (sum, cp) => sum + Number(cp.debtBalance),
      0,
    );

    const debtors = counterparties.filter((cp) => Number(cp.debtBalance) > 0);
    const creditors = counterparties.filter((cp) => Number(cp.debtBalance) < 0);

    return {
      totalDebt,
      totalDebtors: debtors.length,
      totalCreditors: creditors.length,
      debtors,
      creditors,
    };
  }
}
