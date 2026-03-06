import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InventoryItem } from '../entities';
import {
  CreateInventoryItemDto,
  UpdateInventoryItemDto,
} from './dto/inventory-item.dto';

@Injectable()
export class InventoryService {
  constructor(
    @InjectRepository(InventoryItem) private itemRepo: Repository<InventoryItem>,
  ) {}

  async create(dto: CreateInventoryItemDto) {
    const item = this.itemRepo.create(dto);
    return this.itemRepo.save(item);
  }

  async findAll(companyId: string, includeDeleted = false) {
    const where: any = { companyId };
    if (!includeDeleted) {
      where.isDeleted = false;
    }
    return this.itemRepo.find({ where, order: { name: 'ASC' } });
  }

  async findOne(id: string) {
    const item = await this.itemRepo.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Inventory item not found');
    return item;
  }

  async update(id: string, dto: UpdateInventoryItemDto) {
    const item = await this.itemRepo.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Inventory item not found');
    Object.assign(item, dto);
    return this.itemRepo.save(item);
  }

  async softDelete(id: string) {
    const item = await this.itemRepo.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Inventory item not found');
    item.isDeleted = true;
    item.deletedAt = new Date();
    return this.itemRepo.save(item);
  }

  async restore(id: string) {
    const item = await this.itemRepo.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Inventory item not found');
    item.isDeleted = false;
    item.deletedAt = null;
    return this.itemRepo.save(item);
  }

  async getLowStockItems(companyId: string) {
    return this.itemRepo
      .createQueryBuilder('item')
      .where('item.companyId = :companyId', { companyId })
      .andWhere('item.isDeleted = false')
      .andWhere('item.quantity <= item.minStockLevel')
      .andWhere('item.minStockLevel > 0')
      .orderBy('item.quantity', 'ASC')
      .getMany();
  }

  async getInventoryValue(companyId: string) {
    const result = await this.itemRepo
      .createQueryBuilder('item')
      .where('item.companyId = :companyId', { companyId })
      .andWhere('item.isDeleted = false')
      .select('SUM(item.quantity * item.costPrice)', 'totalCostValue')
      .addSelect('SUM(item.quantity * item.sellPrice)', 'totalSellValue')
      .addSelect('COUNT(*)', 'totalItems')
      .getRawOne();

    return {
      totalCostValue: parseFloat(result?.totalCostValue || '0'),
      totalSellValue: parseFloat(result?.totalSellValue || '0'),
      totalItems: parseInt(result?.totalItems || '0'),
      potentialProfit:
        parseFloat(result?.totalSellValue || '0') -
        parseFloat(result?.totalCostValue || '0'),
    };
  }
}
