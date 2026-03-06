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
import { AuditLog } from './audit-log.entity';
import { ChatMessage } from './chat-message.entity';
import { Exclude } from 'class-transformer';

export enum UserRole {
  PLATFORM_ADMIN = 'platform_admin',
  ACCOUNTANT_ADMIN = 'accountant_admin', // accounting firm admin
  ACCOUNTANT = 'accountant', // accounting firm employee
  CLIENT_ADMIN = 'client_admin', // client company admin
  CLIENT_USER = 'client_user', // client company user
  VIEWER = 'viewer',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column()
  @Exclude()
  password: string;

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.CLIENT_USER })
  role: UserRole;

  @Column({ default: true })
  isActive: boolean;

  @Column({ nullable: true })
  avatarUrl: string;

  @Column({ nullable: true })
  lastLoginAt: Date | null;

  @Column({ default: false })
  twoFactorEnabled: boolean;

  @Column({ nullable: true })
  @Exclude()
  twoFactorSecret: string;

  @Column({ default: 0 })
  failedLoginAttempts: number;

  @Column({ nullable: true })
  lockedUntil: Date | null;

  @ManyToOne(() => Company, (company) => company.users, { nullable: true })
  @JoinColumn({ name: 'companyId' })
  company: Company;

  @Column({ nullable: true })
  companyId: string;

  @OneToMany(() => Transaction, (transaction) => transaction.createdBy)
  transactions: Transaction[];

  @OneToMany(() => AuditLog, (audit) => audit.user)
  auditLogs: AuditLog[];

  @OneToMany(() => ChatMessage, (msg) => msg.sender)
  sentMessages: ChatMessage[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
