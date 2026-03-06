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
import { Branch } from './branch.entity';
import { User } from './user.entity';
import { Counterparty } from './counterparty.entity';

export enum TransactionType {
  INCOME = 'income',
  EXPENSE = 'expense',
}

export enum TransactionStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

@Entity('transactions')
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: TransactionType })
  type: TransactionType;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  amount: number;

  @Column({ type: 'varchar', default: 'UZS' })
  currency: string;

  @Column({ type: 'decimal', precision: 18, scale: 6, default: 1 })
  exchangeRate: number;

  @Column({ nullable: true })
  description: string;

  @Column({ nullable: true })
  category: string;

  @Column({
    type: 'enum',
    enum: TransactionStatus,
    default: TransactionStatus.PENDING,
  })
  status: TransactionStatus;

  @Column({ nullable: true })
  receiptUrl: string;

  @Column({ nullable: true })
  invoiceNumber: string;

  @Column({ type: 'date', nullable: true })
  transactionDate: Date;

  @Column({ type: 'simple-json', nullable: true })
  metadata: Record<string, any>;

  @ManyToOne(() => Company, (company) => company.transactions)
  @JoinColumn({ name: 'companyId' })
  company: Company;

  @Column()
  companyId: string;

  @ManyToOne(() => Branch, (branch) => branch.transactions, { nullable: true })
  @JoinColumn({ name: 'branchId' })
  branch: Branch;

  @Column({ nullable: true })
  branchId: string;

  @ManyToOne(() => User, (user) => user.transactions)
  @JoinColumn({ name: 'createdById' })
  createdBy: User;

  @Column()
  createdById: string;

  @ManyToOne(() => Counterparty, (cp) => cp.transactions, { nullable: true })
  @JoinColumn({ name: 'counterpartyId' })
  counterparty: Counterparty;

  @Column({ nullable: true })
  counterpartyId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
