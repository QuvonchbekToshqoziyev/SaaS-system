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
import { User } from './user.entity';

export enum PaymentMethod {
  PAYME = 'payme',
  CLICK = 'click',
}

/**
 * Payment status lifecycle:
 *   pending → paid       (provider confirms via verified callback / server-side check)
 *   pending → failed     (provider reports failure)
 *   pending → cancelled  (user or provider cancels)
 *   pending → expired    (TTL exceeded without confirmation)
 *
 * Only backend + verified callback can move to "paid".
 * Frontend redirect alone NEVER counts as payment success.
 */
export enum PaymentStatus {
  PENDING = 'pending',
  PAID = 'paid',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
}

export enum BillingPeriod {
  MONTHLY = 'monthly',
  YEARLY = 'yearly',
}

@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'companyId' })
  company: Company;

  @Column()
  companyId: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'createdById' })
  createdBy: User;

  @Column({ nullable: true })
  createdById: string;

  // Which plan is being purchased
  @Column({ type: 'varchar' })
  planCode: string;

  @Column({ type: 'varchar', default: BillingPeriod.MONTHLY })
  billingPeriod: BillingPeriod;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  amount: number;

  @Column({ type: 'varchar', default: 'UZS' })
  currency: string;

  @Column({ type: 'varchar' })
  paymentMethod: PaymentMethod;

  @Column({ type: 'varchar', default: PaymentStatus.PENDING })
  status: PaymentStatus;

  // Provider-assigned transaction ID
  @Column({ type: 'varchar', nullable: true })
  providerTransactionId: string;

  // Provider invoice / checkout session ID
  @Column({ type: 'varchar', nullable: true })
  providerInvoiceId: string;

  // Our unique order ID sent to the payment provider
  @Column({ type: 'varchar', unique: true })
  orderId: string;

  // URL to redirect user to provider-hosted checkout
  @Column({ type: 'text', nullable: true })
  paymentUrl: string;

  /**
   * Raw callback/webhook payloads from provider — stored for audit/debugging.
   * Array of payloads, one per callback received (providers may retry).
   */
  @Column({ type: 'simple-json', nullable: true })
  providerPayload: Record<string, any>[];

  // Additional metadata
  @Column({ type: 'simple-json', nullable: true })
  metadata: Record<string, any>;

  @Column({ type: 'timestamp', nullable: true })
  paidAt: Date;

  // When this subscription period expires (set on successful payment)
  @Column({ type: 'timestamp', nullable: true })
  subscriptionExpiresAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
