import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Transaction,
  TransactionType,
  Counterparty,
  Employee,
  InventoryItem,
  Company,
} from '../entities';

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Transaction) private txRepo: Repository<Transaction>,
    @InjectRepository(Counterparty) private cpRepo: Repository<Counterparty>,
    @InjectRepository(Employee) private empRepo: Repository<Employee>,
    @InjectRepository(InventoryItem) private itemRepo: Repository<InventoryItem>,
    @InjectRepository(Company) private companyRepo: Repository<Company>,
  ) {}

  async getFinancialOverview(companyId: string, startDate?: string, endDate?: string) {
    const qb = this.txRepo
      .createQueryBuilder('tx')
      .where('tx.companyId = :companyId', { companyId })
      .andWhere('tx.status = :status', { status: 'approved' });

    if (startDate) qb.andWhere('tx.transactionDate >= :startDate', { startDate });
    if (endDate) qb.andWhere('tx.transactionDate <= :endDate', { endDate });

    const income = await qb
      .clone()
      .andWhere('tx.type = :type', { type: TransactionType.INCOME })
      .select('SUM(tx.amount * tx.exchangeRate)', 'total')
      .addSelect('COUNT(*)', 'count')
      .getRawOne();

    const expense = await qb
      .clone()
      .andWhere('tx.type = :type', { type: TransactionType.EXPENSE })
      .select('SUM(tx.amount * tx.exchangeRate)', 'total')
      .addSelect('COUNT(*)', 'count')
      .getRawOne();

    // Category breakdown
    const categoryBreakdown = await qb
      .clone()
      .select('tx.category', 'category')
      .addSelect('tx.type', 'type')
      .addSelect('SUM(tx.amount * tx.exchangeRate)', 'total')
      .addSelect('COUNT(*)', 'count')
      .groupBy('tx.category')
      .addGroupBy('tx.type')
      .orderBy('total', 'DESC')
      .getRawMany();

    // Branch breakdown
    const branchBreakdown = await qb
      .clone()
      .leftJoin('tx.branch', 'branch')
      .select('branch.name', 'branchName')
      .addSelect('tx.type', 'type')
      .addSelect('SUM(tx.amount * tx.exchangeRate)', 'total')
      .groupBy('branch.name')
      .addGroupBy('tx.type')
      .getRawMany();

    return {
      totalIncome: parseFloat(income?.total || '0'),
      incomeCount: parseInt(income?.count || '0'),
      totalExpense: parseFloat(expense?.total || '0'),
      expenseCount: parseInt(expense?.count || '0'),
      netProfit:
        parseFloat(income?.total || '0') - parseFloat(expense?.total || '0'),
      categoryBreakdown,
      branchBreakdown,
    };
  }

  async getDailyReport(companyId: string, date: string) {
    const transactions = await this.txRepo.find({
      where: {
        companyId,
        transactionDate: new Date(date) as any,
      },
      relations: ['createdBy', 'counterparty', 'branch'],
      order: { createdAt: 'ASC' },
    });

    const income = transactions
      .filter((t) => t.type === TransactionType.INCOME)
      .reduce((sum, t) => sum + Number(t.amount) * Number(t.exchangeRate), 0);

    const expense = transactions
      .filter((t) => t.type === TransactionType.EXPENSE)
      .reduce((sum, t) => sum + Number(t.amount) * Number(t.exchangeRate), 0);

    return {
      date,
      transactions,
      summary: {
        totalIncome: income,
        totalExpense: expense,
        netChange: income - expense,
        transactionCount: transactions.length,
      },
    };
  }

  async getMonthlyReport(companyId: string, year: number, month: number) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);

    const dailySummary = await this.txRepo
      .createQueryBuilder('tx')
      .where('tx.companyId = :companyId', { companyId })
      .andWhere('tx.transactionDate >= :startDate', { startDate })
      .andWhere('tx.transactionDate <= :endDate', { endDate })
      .andWhere('tx.status = :status', { status: 'approved' })
      .select("TO_CHAR(tx.transactionDate, 'YYYY-MM-DD')", 'date')
      .addSelect('tx.type', 'type')
      .addSelect('SUM(tx.amount * tx.exchangeRate)', 'total')
      .addSelect('COUNT(*)', 'count')
      .groupBy('date')
      .addGroupBy('tx.type')
      .orderBy('date', 'ASC')
      .getRawMany();

    return {
      year,
      month,
      dailySummary,
    };
  }

  async getCompanyKPIs(companyId: string) {
    // Total debt
    const debtResult = await this.cpRepo
      .createQueryBuilder('cp')
      .where('cp.companyId = :companyId', { companyId })
      .andWhere('cp.isActive = true')
      .select('SUM(cp.debtBalance)', 'totalDebt')
      .addSelect('COUNT(*)', 'totalCounterparties')
      .getRawOne();

    // Inventory value
    const inventoryResult = await this.itemRepo
      .createQueryBuilder('item')
      .where('item.companyId = :companyId', { companyId })
      .andWhere('item.isDeleted = false')
      .select('SUM(item.quantity * item.costPrice)', 'inventoryValue')
      .addSelect('COUNT(*)', 'totalItems')
      .getRawOne();

    // Employee stats
    const employeeResult = await this.empRepo
      .createQueryBuilder('emp')
      .where('emp.companyId = :companyId', { companyId })
      .andWhere('emp.isActive = true')
      .select('SUM(emp.salary)', 'totalPayroll')
      .addSelect('COUNT(*)', 'totalEmployees')
      .getRawOne();

    // Monthly transaction trend (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const monthlyTrend = await this.txRepo
      .createQueryBuilder('tx')
      .where('tx.companyId = :companyId', { companyId })
      .andWhere('tx.transactionDate >= :sixMonthsAgo', { sixMonthsAgo })
      .andWhere('tx.status = :status', { status: 'approved' })
      .select("TO_CHAR(tx.transactionDate, 'YYYY-MM')", 'month')
      .addSelect('tx.type', 'type')
      .addSelect('SUM(tx.amount * tx.exchangeRate)', 'total')
      .groupBy('month')
      .addGroupBy('tx.type')
      .orderBy('month', 'ASC')
      .getRawMany();

    return {
      totalDebt: parseFloat(debtResult?.totalDebt || '0'),
      totalCounterparties: parseInt(debtResult?.totalCounterparties || '0'),
      inventoryValue: parseFloat(inventoryResult?.inventoryValue || '0'),
      totalInventoryItems: parseInt(inventoryResult?.totalItems || '0'),
      totalPayroll: parseFloat(employeeResult?.totalPayroll || '0'),
      totalEmployees: parseInt(employeeResult?.totalEmployees || '0'),
      monthlyTrend,
    };
  }

  // For accounting firm: overview of all client companies
  async getAccountingFirmOverview(accountingFirmId: string) {
    const clientCompanies = await this.companyRepo.find({
      where: { accountingFirmId },
      relations: ['users'],
    });

    const overview = await Promise.all(
      clientCompanies.map(async (company) => {
        const balance = await this.txRepo
          .createQueryBuilder('tx')
          .where('tx.companyId = :companyId', { companyId: company.id })
          .andWhere('tx.status = :status', { status: 'approved' })
          .select('tx.type', 'type')
          .addSelect('SUM(tx.amount * tx.exchangeRate)', 'total')
          .groupBy('tx.type')
          .getRawMany();

        const income = balance.find((b) => b.type === 'income');
        const expense = balance.find((b) => b.type === 'expense');

        return {
          company: {
            id: company.id,
            name: company.name,
            subscriptionPlan: company.subscriptionPlan,
            isActive: company.isActive,
            userCount: company.users?.length || 0,
          },
          totalIncome: parseFloat(income?.total || '0'),
          totalExpense: parseFloat(expense?.total || '0'),
          netBalance:
            parseFloat(income?.total || '0') -
            parseFloat(expense?.total || '0'),
        };
      }),
    );

    return {
      totalClients: clientCompanies.length,
      activeClients: clientCompanies.filter((c) => c.isActive).length,
      clients: overview,
    };
  }
}
