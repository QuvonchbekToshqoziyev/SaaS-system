import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog, User } from '../entities';

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog) private auditRepo: Repository<AuditLog>,
  ) {}

  async log(params: {
    action: string;
    entityType: string;
    entityId?: string;
    companyId?: string;
    userId: string;
    oldData?: Record<string, any>;
    newData?: Record<string, any>;
    ipAddress?: string;
    userAgent?: string;
  }) {
    const entry = this.auditRepo.create(params);
    return this.auditRepo.save(entry);
  }

  async findAll(
    companyId?: string,
    options?: {
      userId?: string;
      entityType?: string;
      action?: string;
      startDate?: string;
      endDate?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const page = options?.page || 1;
    const limit = Math.min(options?.limit || 50, 100);

    const qb = this.auditRepo
      .createQueryBuilder('audit')
      .leftJoinAndSelect('audit.user', 'user')
      .select([
        'audit',
        'user.id',
        'user.firstName',
        'user.lastName',
        'user.email',
        'user.role',
      ]);

    if (companyId) {
      qb.where('audit.companyId = :companyId', { companyId });
    }
    if (options?.userId) {
      qb.andWhere('audit.userId = :userId', { userId: options.userId });
    }
    if (options?.entityType) {
      qb.andWhere('audit.entityType = :entityType', {
        entityType: options.entityType,
      });
    }
    if (options?.action) {
      qb.andWhere('audit.action = :action', { action: options.action });
    }
    if (options?.startDate) {
      qb.andWhere('audit.createdAt >= :startDate', {
        startDate: options.startDate,
      });
    }
    if (options?.endDate) {
      qb.andWhere('audit.createdAt <= :endDate', {
        endDate: options.endDate,
      });
    }

    qb.orderBy('audit.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getActivitySummary(companyId: string) {
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const last7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [count24h, count7d, byAction, byEntity] = await Promise.all([
      this.auditRepo
        .createQueryBuilder('audit')
        .where('audit.companyId = :companyId', { companyId })
        .andWhere('audit.createdAt >= :since', { since: last24h })
        .getCount(),

      this.auditRepo
        .createQueryBuilder('audit')
        .where('audit.companyId = :companyId', { companyId })
        .andWhere('audit.createdAt >= :since', { since: last7d })
        .getCount(),

      this.auditRepo
        .createQueryBuilder('audit')
        .where('audit.companyId = :companyId', { companyId })
        .andWhere('audit.createdAt >= :since', { since: last7d })
        .select('audit.action', 'action')
        .addSelect('COUNT(*)', 'count')
        .groupBy('audit.action')
        .orderBy('count', 'DESC')
        .getRawMany(),

      this.auditRepo
        .createQueryBuilder('audit')
        .where('audit.companyId = :companyId', { companyId })
        .andWhere('audit.createdAt >= :since', { since: last7d })
        .select('audit.entityType', 'entityType')
        .addSelect('COUNT(*)', 'count')
        .groupBy('audit.entityType')
        .orderBy('count', 'DESC')
        .getRawMany(),
    ]);

    return {
      last24Hours: count24h,
      last7Days: count7d,
      byAction,
      byEntity,
    };
  }
}
