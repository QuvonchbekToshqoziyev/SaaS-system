import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';
import { Branch } from './branch.entity';
import { Transaction } from './transaction.entity';
import { Counterparty } from './counterparty.entity';
import { InventoryItem } from './inventory-item.entity';
import { Employee } from './employee.entity';

export enum CompanyType {
  ACCOUNTING_FIRM = 'accounting_firm',
  CLIENT = 'client',
}

export enum SubscriptionPlan {
  FREE = 'free',
  BASIC = 'basic',
  PROFESSIONAL = 'professional',
  ENTERPRISE = 'enterprise',
}

@Entity('companies')
export class Company {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'enum', enum: CompanyType })
  type: CompanyType;

  @Column({ nullable: true })
  inn: string; // Tax ID

  @Column({ nullable: true })
  address: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ nullable: true })
  email: string;

  @Column({ nullable: true })
  logoUrl: string;

  @Column({
    type: 'enum',
    enum: SubscriptionPlan,
    default: SubscriptionPlan.FREE,
  })
  subscriptionPlan: SubscriptionPlan;

  @Column({ nullable: true })
  subscriptionExpiresAt: Date;

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'varchar', default: 'UZS' })
  defaultCurrency: string;

  @Column({ type: 'simple-json', nullable: true })
  settings: Record<string, any>;

  // For client companies, link to the accounting firm managing them
  @ManyToOne(() => Company, (company) => company.clientCompanies, {
    nullable: true,
  })
  @JoinColumn({ name: 'accountingFirmId' })
  accountingFirm: Company;

  @Column({ nullable: true })
  accountingFirmId: string;

  @OneToMany(() => Company, (company) => company.accountingFirm)
  clientCompanies: Company[];

  @OneToMany(() => User, (user) => user.company)
  users: User[];

  @OneToMany(() => Branch, (branch) => branch.company)
  branches: Branch[];

  @OneToMany(() => Transaction, (tx) => tx.company)
  transactions: Transaction[];

  @OneToMany(() => Counterparty, (cp) => cp.company)
  counterparties: Counterparty[];

  @OneToMany(() => InventoryItem, (item) => item.company)
  inventoryItems: InventoryItem[];

  @OneToMany(() => Employee, (emp) => emp.company)
  employees: Employee[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
