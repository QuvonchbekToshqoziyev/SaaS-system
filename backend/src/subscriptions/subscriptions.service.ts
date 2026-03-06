import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SubscriptionPlanDetail, PlanCode, Company, SubscriptionPlan } from '../entities';
import { CreatePlanDto, UpdatePlanDto } from './dto';

@Injectable()
export class SubscriptionsService {
  constructor(
    @InjectRepository(SubscriptionPlanDetail)
    private planRepo: Repository<SubscriptionPlanDetail>,
    @InjectRepository(Company)
    private companyRepo: Repository<Company>,
  ) {}

  // ─── Plan CRUD ────────────────────────────────────────────

  async createPlan(dto: CreatePlanDto) {
    const plan = this.planRepo.create(dto);
    return this.planRepo.save(plan);
  }

  async findAllPlans() {
    return this.planRepo.find({ where: { isActive: true }, order: { sortOrder: 'ASC' } });
  }

  async findPlanByCode(code: PlanCode) {
    const plan = await this.planRepo.findOne({ where: { code } });
    if (!plan) throw new NotFoundException(`Plan "${code}" not found`);
    return plan;
  }

  async updatePlan(code: PlanCode, dto: UpdatePlanDto) {
    const plan = await this.findPlanByCode(code);
    Object.assign(plan, dto);
    return this.planRepo.save(plan);
  }

  // ─── Company subscription helpers ────────────────────────

  async getCompanySubscription(companyId: string) {
    const company = await this.companyRepo.findOne({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Company not found');

    const plan = await this.planRepo.findOne({
      where: { code: company.subscriptionPlan as unknown as PlanCode },
    });

    const isExpired = company.subscriptionExpiresAt
      ? new Date(company.subscriptionExpiresAt) < new Date()
      : company.subscriptionPlan !== SubscriptionPlan.FREE;

    return {
      company: {
        id: company.id,
        name: company.name,
        subscriptionPlan: company.subscriptionPlan,
        subscriptionExpiresAt: company.subscriptionExpiresAt,
      },
      plan: plan || null,
      isActive: !isExpired || company.subscriptionPlan === SubscriptionPlan.FREE,
      isExpired,
      daysRemaining: company.subscriptionExpiresAt
        ? Math.max(0, Math.ceil((new Date(company.subscriptionExpiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
        : null,
    };
  }

  async activateSubscription(companyId: string, planCode: string, expiresAt: Date) {
    const company = await this.companyRepo.findOne({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Company not found');

    company.subscriptionPlan = planCode as SubscriptionPlan;
    company.subscriptionExpiresAt = expiresAt;
    return this.companyRepo.save(company);
  }

  async checkFeatureAccess(companyId: string, feature: string): Promise<boolean> {
    const company = await this.companyRepo.findOne({ where: { id: companyId } });
    if (!company) return false;

    const plan = await this.planRepo.findOne({
      where: { code: company.subscriptionPlan as unknown as PlanCode },
    });
    if (!plan) return false;

    // Free plan always has limited access
    if (plan.code === PlanCode.FREE) {
      const freeFeatures = ['dashboard', 'transactions_basic', 'chat'];
      return freeFeatures.includes(feature);
    }

    // Check if subscription is expired
    if (company.subscriptionExpiresAt && new Date(company.subscriptionExpiresAt) < new Date()) {
      return false;
    }

    return plan.features?.includes(feature) ?? false;
  }

  async checkLimitAccess(companyId: string, limitKey: string, currentCount: number): Promise<boolean> {
    const company = await this.companyRepo.findOne({ where: { id: companyId } });
    if (!company) return false;

    const plan = await this.planRepo.findOne({
      where: { code: company.subscriptionPlan as unknown as PlanCode },
    });
    if (!plan || !plan.limits) return false;

    const limit = plan.limits[limitKey];
    if (limit === undefined || limit === -1) return true; // -1 = unlimited
    return currentCount < limit;
  }
}
