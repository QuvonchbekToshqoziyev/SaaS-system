import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { Transaction, TransactionType, User, UserRole } from '../entities';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { FilterTransactionDto } from './dto/filter-transaction.dto';

@Injectable()
export class TransactionsService {
  constructor(
    @InjectRepository(Transaction) private txRepo: Repository<Transaction>,
  ) {}

  async create(dto: CreateTransactionDto, currentUser: User) {
    const tx = this.txRepo.create({
      ...dto,
      createdById: currentUser.id,
      transactionDate: dto.transactionDate ? new Date(dto.transactionDate) : new Date(),
    });
    return this.txRepo.save(tx);
  }

  async findAll(companyId: string, filters: FilterTransactionDto) {
    const qb = this.txRepo
      .createQueryBuilder('tx')
      .leftJoinAndSelect('tx.createdBy', 'createdBy')
      .leftJoinAndSelect('tx.branch', 'branch')
      .leftJoinAndSelect('tx.counterparty', 'counterparty')
      .where('tx.companyId = :companyId', { companyId })
      .select([
        'tx',
        'createdBy.id', 'createdBy.firstName', 'createdBy.lastName', 'createdBy.email',
        'branch.id', 'branch.name',
        'counterparty.id', 'counterparty.name',
      ]);

    if (filters.type) {
      qb.andWhere('tx.type = :type', { type: filters.type });
    }
    if (filters.status) {
      qb.andWhere('tx.status = :status', { status: filters.status });
    }
    if (filters.category) {
      qb.andWhere('tx.category = :category', { category: filters.category });
    }
    if (filters.branchId) {
      qb.andWhere('tx.branchId = :branchId', { branchId: filters.branchId });
    }
    if (filters.counterpartyId) {
      qb.andWhere('tx.counterpartyId = :counterpartyId', {
        counterpartyId: filters.counterpartyId,
      });
    }
    if (filters.startDate) {
      qb.andWhere('tx.transactionDate >= :startDate', {
        startDate: filters.startDate,
      });
    }
    if (filters.endDate) {
      qb.andWhere('tx.transactionDate <= :endDate', {
        endDate: filters.endDate,
      });
    }
    if (filters.currency) {
      qb.andWhere('tx.currency = :currency', { currency: filters.currency });
    }

    qb.orderBy('tx.transactionDate', 'DESC');
    return qb.getMany();
  }

  async findOne(id: string) {
    const tx = await this.txRepo.findOne({
      where: { id },
      relations: ['createdBy', 'branch', 'counterparty', 'company'],
    });
    if (!tx) throw new NotFoundException('Transaction not found');
    return tx;
  }

  async update(id: string, dto: UpdateTransactionDto, currentUser: User) {
    const tx = await this.txRepo.findOne({ where: { id } });
    if (!tx) throw new NotFoundException('Transaction not found');

    if (
      currentUser.role !== UserRole.PLATFORM_ADMIN &&
      currentUser.companyId !== tx.companyId
    ) {
      throw new ForbiddenException('Not authorized');
    }

    Object.assign(tx, dto);
    return this.txRepo.save(tx);
  }

  async delete(id: string, currentUser: User) {
    const tx = await this.txRepo.findOne({ where: { id } });
    if (!tx) throw new NotFoundException('Transaction not found');

    if (
      currentUser.role !== UserRole.PLATFORM_ADMIN &&
      currentUser.companyId !== tx.companyId
    ) {
      throw new ForbiddenException('Not authorized');
    }

    return this.txRepo.remove(tx);
  }

  async getBalance(companyId: string, currency?: string) {
    const qb = this.txRepo
      .createQueryBuilder('tx')
      .where('tx.companyId = :companyId', { companyId })
      .andWhere('tx.status = :status', { status: 'approved' });

    if (currency) {
      qb.andWhere('tx.currency = :currency', { currency });
    }

    const income = await qb
      .clone()
      .andWhere('tx.type = :type', { type: TransactionType.INCOME })
      .select('SUM(tx.amount * tx.exchangeRate)', 'total')
      .getRawOne();

    const expense = await qb
      .clone()
      .andWhere('tx.type = :type', { type: TransactionType.EXPENSE })
      .select('SUM(tx.amount * tx.exchangeRate)', 'total')
      .getRawOne();

    const totalIncome = parseFloat(income?.total || '0');
    const totalExpense = parseFloat(expense?.total || '0');

    return {
      income: totalIncome,
      expense: totalExpense,
      balance: totalIncome - totalExpense,
    };
  }

  async getSummary(companyId: string, period: 'daily' | 'monthly' | 'yearly' = 'monthly') {
    let dateFormat: string;
    switch (period) {
      case 'daily':
        dateFormat = 'YYYY-MM-DD';
        break;
      case 'yearly':
        dateFormat = 'YYYY';
        break;
      default:
        dateFormat = 'YYYY-MM';
    }

    const result = await this.txRepo
      .createQueryBuilder('tx')
      .where('tx.companyId = :companyId', { companyId })
      .andWhere('tx.status = :status', { status: 'approved' })
      .select(`TO_CHAR(tx.transactionDate, '${dateFormat}')`, 'period')
      .addSelect('tx.type', 'type')
      .addSelect('SUM(tx.amount * tx.exchangeRate)', 'total')
      .addSelect('COUNT(*)', 'count')
      .groupBy('period')
      .addGroupBy('tx.type')
      .orderBy('period', 'ASC')
      .getRawMany();

    return result;
  }
}
