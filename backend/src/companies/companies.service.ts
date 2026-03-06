import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company, CompanyType, User, UserRole } from '../entities';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';

@Injectable()
export class CompaniesService {
  constructor(
    @InjectRepository(Company) private companyRepo: Repository<Company>,
  ) {}

  async create(dto: CreateCompanyDto) {
    const company = this.companyRepo.create(dto);
    return this.companyRepo.save(company);
  }

  async findAll(currentUser: User) {
    const qb = this.companyRepo
      .createQueryBuilder('company')
      .leftJoinAndSelect('company.accountingFirm', 'accountingFirm');

    if (currentUser.role === UserRole.PLATFORM_ADMIN) {
      // Platform admin sees all
    } else if (
      currentUser.role === UserRole.ACCOUNTANT_ADMIN ||
      currentUser.role === UserRole.ACCOUNTANT
    ) {
      // Accounting firm sees own company + client companies
      qb.where(
        '(company.id = :companyId OR company.accountingFirmId = :companyId)',
        { companyId: currentUser.companyId },
      );
    } else {
      // Client sees only own company
      qb.where('company.id = :companyId', {
        companyId: currentUser.companyId,
      });
    }

    return qb.getMany();
  }

  async findOne(id: string) {
    const company = await this.companyRepo.findOne({
      where: { id },
      relations: ['accountingFirm', 'users', 'branches'],
    });
    if (!company) throw new NotFoundException('Company not found');
    return company;
  }

  async getClientCompanies(accountingFirmId: string) {
    return this.companyRepo.find({
      where: { accountingFirmId },
      relations: ['users'],
    });
  }

  async update(id: string, dto: UpdateCompanyDto, currentUser: User) {
    const company = await this.companyRepo.findOne({ where: { id } });
    if (!company) throw new NotFoundException('Company not found');

    if (
      currentUser.role !== UserRole.PLATFORM_ADMIN &&
      currentUser.companyId !== id &&
      company.accountingFirmId !== currentUser.companyId
    ) {
      throw new ForbiddenException('Not authorized to update this company');
    }

    Object.assign(company, dto);
    return this.companyRepo.save(company);
  }

  async getDashboardStats(companyId: string) {
    const company = await this.companyRepo.findOne({
      where: { id: companyId },
      relations: ['users', 'branches', 'transactions', 'employees'],
    });
    if (!company) throw new NotFoundException('Company not found');

    return {
      totalUsers: company.users?.length || 0,
      totalBranches: company.branches?.length || 0,
      totalTransactions: company.transactions?.length || 0,
      totalEmployees: company.employees?.length || 0,
      subscriptionPlan: company.subscriptionPlan,
      subscriptionExpiresAt: company.subscriptionExpiresAt,
    };
  }
}
