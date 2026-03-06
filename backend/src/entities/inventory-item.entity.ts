import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Company } from './company.entity';

@Entity('inventory_items')
export class InventoryItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  sku: string;

  @Column({ nullable: true })
  barcode: string;

  @Column({ nullable: true })
  category: string;

  @Column({ nullable: true })
  unit: string;

  @Column({ type: 'decimal', precision: 18, scale: 3, default: 0 })
  quantity: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  costPrice: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  sellPrice: number;

  @Column({ type: 'varchar', default: 'UZS' })
  currency: string;

  @Column({ type: 'decimal', precision: 18, scale: 3, default: 0 })
  minStockLevel: number;

  @Column({ nullable: true })
  description: string;

  @Column({ default: true })
  isActive: boolean;

  @Column({ default: false })
  isDeleted: boolean;

  @Column({ nullable: true })
  deletedAt: Date | null;

  @ManyToOne(() => Company, (company) => company.inventoryItems)
  @JoinColumn({ name: 'companyId' })
  company: Company;

  @Column()
  companyId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
