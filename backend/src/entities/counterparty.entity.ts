import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { Company } from './company.entity';
import { Transaction } from './transaction.entity';

export enum CounterpartyType {
  CLIENT = 'client',
  SUPPLIER = 'supplier',
  BOTH = 'both',
}

@Entity('counterparties')
export class Counterparty {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'enum', enum: CounterpartyType, default: CounterpartyType.CLIENT })
  type: CounterpartyType;

  @Column({ nullable: true })
  phone: string;

  @Column({ nullable: true })
  email: string;

  @Column({ nullable: true })
  inn: string;

  @Column({ nullable: true })
  address: string;

  @Column({ nullable: true })
  contactPerson: string;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  debtBalance: number;

  @Column({ type: 'varchar', default: 'UZS' })
  debtCurrency: string;

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'simple-json', nullable: true })
  metadata: Record<string, any>;

  @ManyToOne(() => Company, (company) => company.counterparties)
  @JoinColumn({ name: 'companyId' })
  company: Company;

  @Column()
  companyId: string;

  @OneToMany(() => Transaction, (tx) => tx.counterparty)
  transactions: Transaction[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
