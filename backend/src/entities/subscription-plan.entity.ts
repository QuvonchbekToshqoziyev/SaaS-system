import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum PlanCode {
  FREE = 'free',
  BASIC = 'basic',
  PROFESSIONAL = 'professional',
  ENTERPRISE = 'enterprise',
}

@Entity('subscription_plans')
export class SubscriptionPlanDetail {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'enum', enum: PlanCode, unique: true })
  code: PlanCode;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  monthlyPrice: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  yearlyPrice: number;

  @Column({ type: 'varchar', default: 'UZS' })
  currency: string;

  // JSON array of feature strings
  @Column({ type: 'simple-json', nullable: true })
  features: string[];

  // Limits: { maxUsers, maxBranches, maxTransactionsPerMonth, maxInventoryItems, maxEmployees }
  @Column({ type: 'simple-json', nullable: true })
  limits: Record<string, number>;

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
