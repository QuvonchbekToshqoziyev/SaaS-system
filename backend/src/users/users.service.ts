import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from '../entities';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
  ) {}

  async findAll(currentUser: User) {
    const qb = this.userRepo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.company', 'company')
      .select([
        'user.id', 'user.email', 'user.firstName', 'user.lastName',
        'user.phone', 'user.role', 'user.isActive', 'user.avatarUrl',
        'user.lastLoginAt', 'user.companyId', 'user.createdAt',
        'company.id', 'company.name', 'company.type',
      ]);

    // Non-platform admins can only see users in their own company or client companies
    if (currentUser.role !== UserRole.PLATFORM_ADMIN) {
      if (
        currentUser.role === UserRole.ACCOUNTANT_ADMIN ||
        currentUser.role === UserRole.ACCOUNTANT
      ) {
        // Accountants can see their own company users + client company users
        qb.where(
          '(user.companyId = :companyId OR company.accountingFirmId = :companyId)',
          { companyId: currentUser.companyId },
        );
      } else {
        qb.where('user.companyId = :companyId', {
          companyId: currentUser.companyId,
        });
      }
    }

    return qb.getMany();
  }

  async findOne(id: string) {
    const user = await this.userRepo.findOne({
      where: { id },
      relations: ['company'],
    });
    if (!user) throw new NotFoundException('User not found');
    const { password, twoFactorSecret, ...rest } = user;
    return rest;
  }

  async update(id: string, dto: UpdateUserDto, currentUser: User) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    // Only platform admin or same-company admin can update users
    if (
      currentUser.role !== UserRole.PLATFORM_ADMIN &&
      currentUser.companyId !== user.companyId
    ) {
      throw new ForbiddenException('Cannot update users from other companies');
    }

    Object.assign(user, dto);
    const saved = await this.userRepo.save(user);
    const { password, twoFactorSecret, ...rest } = saved;
    return rest;
  }

  async deactivate(id: string, currentUser: User) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    if (user.id === currentUser.id) {
      throw new ForbiddenException('Cannot deactivate yourself');
    }

    user.isActive = false;
    return this.userRepo.save(user);
  }

  async getStats(companyId?: string) {
    const qb = this.userRepo.createQueryBuilder('user');
    if (companyId) {
      qb.where('user.companyId = :companyId', { companyId });
    }

    const total = await qb.getCount();
    const active = await qb.clone().andWhere('user.isActive = true').getCount();
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    const newUsers = await qb
      .clone()
      .andWhere('user.createdAt >= :lastMonth', { lastMonth })
      .getCount();

    return { total, active, inactive: total - active, newUsers };
  }
}
