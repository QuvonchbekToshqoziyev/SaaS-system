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

@Entity('employees')
export class Employee {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ nullable: true })
  position: string;

  @Column({ nullable: true })
  department: string;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  salary: number;

  @Column({ type: 'varchar', default: 'UZS' })
  salaryCurrency: string;

  @Column({ type: 'simple-json', nullable: true })
  salaryHistory: Array<{ amount: number; currency: string; date: string; note?: string }>;

  @Column({ nullable: true })
  hireDate: Date;

  @Column({ default: true })
  isActive: boolean;

  @Column({ nullable: true })
  avatarUrl: string;

  @ManyToOne(() => Company, (company) => company.employees)
  @JoinColumn({ name: 'companyId' })
  company: Company;

  @Column()
  companyId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
