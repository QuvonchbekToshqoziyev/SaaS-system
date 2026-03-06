import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Branch } from '../entities';
import { CreateBranchDto, UpdateBranchDto } from './dto/branch.dto';

@Injectable()
export class BranchesService {
  constructor(
    @InjectRepository(Branch) private branchRepo: Repository<Branch>,
  ) {}

  async create(dto: CreateBranchDto) {
    const branch = this.branchRepo.create(dto);
    return this.branchRepo.save(branch);
  }

  async findAll(companyId: string) {
    return this.branchRepo.find({
      where: { companyId, isActive: true },
      order: { name: 'ASC' },
    });
  }

  async findOne(id: string) {
    const branch = await this.branchRepo.findOne({
      where: { id },
      relations: ['transactions'],
    });
    if (!branch) throw new NotFoundException('Branch not found');
    return branch;
  }

  async update(id: string, dto: UpdateBranchDto) {
    const branch = await this.branchRepo.findOne({ where: { id } });
    if (!branch) throw new NotFoundException('Branch not found');
    Object.assign(branch, dto);
    return this.branchRepo.save(branch);
  }

  async deactivate(id: string) {
    const branch = await this.branchRepo.findOne({ where: { id } });
    if (!branch) throw new NotFoundException('Branch not found');
    branch.isActive = false;
    return this.branchRepo.save(branch);
  }
}
