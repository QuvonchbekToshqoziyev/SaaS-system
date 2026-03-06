import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import {
  Payment,
  PaymentMethod,
  PaymentStatus,
  BillingPeriod,
  SubscriptionPlanDetail,
  PlanCode,
  Company,
  SubscriptionPlan,
} from '../entities';
import { CreatePaymentDto } from './dto';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { PaymeService } from './providers/payme.service';
import { ClickService } from './providers/click.service';
import { MockCheckoutService } from './providers/mock-checkout.service';
import { v4 as uuid } from 'uuid';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectRepository(Payment) private paymentRepo: Repository<Payment>,
    @InjectRepository(SubscriptionPlanDetail) private planRepo: Repository<SubscriptionPlanDetail>,
    @InjectRepository(Company) private companyRepo: Repository<Company>,
    private dataSource: DataSource,
    private subscriptionsService: SubscriptionsService,
    private paymeService: PaymeService,
    private clickService: ClickService,
    private mockCheckoutService: MockCheckoutService,
  ) {}

  // ═══════════════════════════════════════════════════════════════
  //  CREATE PAYMENT — generate pending record + hosted checkout URL
  // ═══════════════════════════════════════════════════════════════

  async createPayment(dto: CreatePaymentDto, userId: string) {
    // 1. Validate plan
    const plan = await this.planRepo.findOne({
      where: { code: dto.planCode as PlanCode },
    });
    if (!plan) throw new NotFoundException(`Plan "${dto.planCode}" not found`);
    if (plan.code === PlanCode.FREE) {
      throw new BadRequestException('Cannot purchase the free plan');
    }

    // 2. Validate company
    const company = await this.companyRepo.findOne({ where: { id: dto.companyId } });
    if (!company) throw new NotFoundException('Company not found');

    // 3. Calculate amount
    const amount =
      dto.billingPeriod === BillingPeriod.YEARLY
        ? Number(plan.yearlyPrice)
        : Number(plan.monthlyPrice);

    // 4. Unique order ID
    const orderId = `AH-${Date.now()}-${uuid().substring(0, 8)}`;

    // 5. Create payment record as PENDING (source of truth — before any redirect)
    const payment = this.paymentRepo.create({
      companyId: dto.companyId,
      createdById: userId,
      planCode: dto.planCode,
      billingPeriod: dto.billingPeriod,
      amount,
      currency: plan.currency || 'UZS',
      paymentMethod: dto.paymentMethod,
      status: PaymentStatus.PENDING,
      orderId,
    });
    const saved = await this.paymentRepo.save(payment);

    // 6. Generate provider-hosted checkout URL
    const returnUrl =
      dto.returnUrl || 'http://localhost:3000/subscriptions?payment=return';
    let paymentUrl: string;

    // In dev mode with mock enabled, override to use mock checkout
    if (this.mockCheckoutService.isEnabled()) {
      paymentUrl = this.mockCheckoutService.generateCheckoutUrl(saved, returnUrl);
    } else if (dto.paymentMethod === PaymentMethod.PAYME) {
      paymentUrl = this.paymeService.generateCheckoutUrl(saved, returnUrl);
    } else if (dto.paymentMethod === PaymentMethod.CLICK) {
      paymentUrl = this.clickService.generateCheckoutUrl(saved, returnUrl);
    } else {
      paymentUrl = '';
    }

    saved.paymentUrl = paymentUrl;
    await this.paymentRepo.save(saved);

    this.logger.log(
      `Payment created: ${saved.orderId} | ${saved.paymentMethod} | ${amount} ${saved.currency}`,
    );

    return {
      paymentId: saved.id,
      orderId: saved.orderId,
      amount: saved.amount,
      currency: saved.currency,
      paymentMethod: saved.paymentMethod,
      paymentUrl,
      status: saved.status,
    };
  }

  // ═══════════════════════════════════════════════════════════════
  //  QUERY ENDPOINTS
  // ═══════════════════════════════════════════════════════════════

  async getCompanyPayments(companyId: string) {
    return this.paymentRepo.find({
      where: { companyId },
      order: { createdAt: 'DESC' },
      relations: ['createdBy'],
    });
  }

  async getPayment(id: string) {
    const payment = await this.paymentRepo.findOne({
      where: { id },
      relations: ['company', 'createdBy'],
    });
    if (!payment) throw new NotFoundException('Payment not found');
    return payment;
  }

  /**
   * Payment status endpoint for frontend polling.
   * Returns only the fields the frontend needs to determine the result.
   */
  async getPaymentStatus(id: string) {
    const payment = await this.paymentRepo.findOne({
      where: { id },
      select: ['id', 'orderId', 'status', 'paidAt', 'planCode', 'billingPeriod'],
    });
    if (!payment) throw new NotFoundException('Payment not found');
    return {
      id: payment.id,
      orderId: payment.orderId,
      status: payment.status,
      paidAt: payment.paidAt,
      planCode: payment.planCode,
      billingPeriod: payment.billingPeriod,
    };
  }

  async getPaymentByOrderId(orderId: string) {
    return this.paymentRepo.findOne({ where: { orderId } });
  }

  // ═══════════════════════════════════════════════════════════════
  //  PAYMENT COMPLETION — DB transaction, idempotent, audited
  // ═══════════════════════════════════════════════════════════════

  /**
   * Mark payment as PAID and activate the subscription.
   *
   * Security / correctness:
   *   - Idempotent: if already PAID, returns existing record without side effects
   *   - Atomic: payment update + subscription activation in one DB transaction
   *   - Audited: providerTransactionId is stored for traceability
   *
   * Only call this AFTER verified provider callback / server-side confirmation.
   */
  async markAsPaid(
    paymentId: string,
    providerTransactionId?: string,
  ): Promise<Payment> {
    const payment = await this.paymentRepo.findOne({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException('Payment not found');

    // Idempotency: already paid → no-op
    if (payment.status === PaymentStatus.PAID) {
      this.logger.warn(
        `Duplicate payment confirmation ignored: ${payment.orderId} (already paid)`,
      );
      return payment;
    }

    // Only pending payments can be completed
    if (payment.status !== PaymentStatus.PENDING) {
      this.logger.warn(
        `Cannot mark ${payment.orderId} as paid — current status: ${payment.status}`,
      );
      throw new BadRequestException(
        `Payment ${payment.orderId} is "${payment.status}", cannot mark as paid`,
      );
    }

    // Calculate subscription expiry
    const now = new Date();
    const expiresAt = new Date(now);
    if (payment.billingPeriod === BillingPeriod.YEARLY) {
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    } else {
      expiresAt.setMonth(expiresAt.getMonth() + 1);
    }

    // Atomic: update payment + activate subscription in a single DB transaction
    await this.dataSource.transaction(async (manager) => {
      payment.status = PaymentStatus.PAID;
      payment.paidAt = now;
      payment.subscriptionExpiresAt = expiresAt;
      if (providerTransactionId) {
        payment.providerTransactionId = providerTransactionId;
      }
      await manager.save(payment);

      // Activate subscription on the company
      const company = await manager.findOne(Company, {
        where: { id: payment.companyId },
      });
      if (company) {
        company.subscriptionPlan = payment.planCode as SubscriptionPlan;
        company.subscriptionExpiresAt = expiresAt;
        await manager.save(company);
      }
    });

    this.logger.log(
      `Payment PAID: ${payment.orderId} | Company ${payment.companyId} → ${payment.planCode} until ${expiresAt.toISOString()}`,
    );

    return payment;
  }

  /**
   * Mark payment as FAILED. Idempotent.
   */
  async markAsFailed(paymentId: string, reason?: string): Promise<Payment> {
    const payment = await this.paymentRepo.findOne({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException('Payment not found');

    // Idempotent: already in terminal state → no-op
    if ([PaymentStatus.PAID, PaymentStatus.FAILED, PaymentStatus.CANCELLED].includes(payment.status)) {
      return payment;
    }

    payment.status = PaymentStatus.FAILED;
    payment.metadata = { ...payment.metadata, failReason: reason };
    this.logger.warn(`Payment FAILED: ${payment.orderId} — ${reason || 'no reason'}`);
    return this.paymentRepo.save(payment);
  }

  /**
   * Mark payment as CANCELLED. Idempotent.
   */
  async markAsCancelled(paymentId: string, reason?: string): Promise<Payment> {
    const payment = await this.paymentRepo.findOne({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException('Payment not found');

    if ([PaymentStatus.PAID, PaymentStatus.FAILED, PaymentStatus.CANCELLED].includes(payment.status)) {
      return payment;
    }

    payment.status = PaymentStatus.CANCELLED;
    payment.metadata = { ...payment.metadata, cancelReason: reason };
    this.logger.warn(`Payment CANCELLED: ${payment.orderId} — ${reason || 'no reason'}`);
    return this.paymentRepo.save(payment);
  }

  // ─── Helper: append raw callback payload for audit ────────────

  private appendCallbackLog(payment: Payment, payload: Record<string, any>) {
    if (!payment.providerPayload) {
      payment.providerPayload = [];
    }
    payment.providerPayload.push({
      ...payload,
      _receivedAt: new Date().toISOString(),
    });
  }

  // ═══════════════════════════════════════════════════════════════
  //  PAYME WEBHOOK — JSON-RPC 2.0
  // ═══════════════════════════════════════════════════════════════

  async handlePaymeWebhook(body: any, authHeader: string) {
    const rpcId = body.id;
    const { method, params } = body;

    // Step 1: Verify Basic Auth — BEFORE any processing
    if (!this.paymeService.verifyWebhookAuth(authHeader)) {
      this.logger.warn('Payme webhook: auth verification FAILED');
      return this.paymeService.errorResponse(rpcId, -32504, 'Unauthorized');
    }

    this.logger.log(`Payme webhook: ${method}`);

    // ── CheckPerformTransaction ────────────────────────────────
    if (method === 'CheckPerformTransaction') {
      const orderId = params?.account?.order_id;
      const amount = params?.amount; // tiyin

      const payment = await this.getPaymentByOrderId(orderId);
      if (!payment) {
        return this.paymeService.errorResponse(rpcId, -31050, 'Order not found');
      }

      const expectedTiyin = Math.round(Number(payment.amount) * 100);
      if (amount !== expectedTiyin) {
        return this.paymeService.errorResponse(rpcId, -31001, 'Incorrect amount');
      }

      // Cannot pay an already-completed or cancelled payment
      if (payment.status !== PaymentStatus.PENDING) {
        return this.paymeService.errorResponse(rpcId, -31008, 'Order not available');
      }

      return this.paymeService.successResponse(rpcId, { allow: true });
    }

    // ── CreateTransaction ──────────────────────────────────────
    if (method === 'CreateTransaction') {
      const orderId = params?.account?.order_id;
      const payment = await this.getPaymentByOrderId(orderId);
      if (!payment) {
        return this.paymeService.errorResponse(rpcId, -31050, 'Order not found');
      }

      // Log raw callback
      this.appendCallbackLog(payment, { method, params });
      payment.providerTransactionId = params.id;
      payment.providerInvoiceId = String(params.id);
      await this.paymentRepo.save(payment);

      return this.paymeService.successResponse(rpcId, {
        create_time: new Date(payment.createdAt).getTime(),
        transaction: params.id,
        state: 1,
      });
    }

    // ── PerformTransaction — payment confirmed ─────────────────
    if (method === 'PerformTransaction') {
      const payment = await this.paymentRepo.findOne({
        where: { providerTransactionId: params.id },
      });
      if (!payment) {
        return this.paymeService.errorResponse(rpcId, -31003, 'Transaction not found');
      }

      // Log raw callback
      this.appendCallbackLog(payment, { method, params });
      await this.paymentRepo.save(payment);

      // Idempotent: markAsPaid handles already-paid gracefully
      await this.markAsPaid(payment.id, params.id);

      return this.paymeService.successResponse(rpcId, {
        transaction: params.id,
        perform_time: Date.now(),
        state: 2,
      });
    }

    // ── CancelTransaction ──────────────────────────────────────
    if (method === 'CancelTransaction') {
      const payment = await this.paymentRepo.findOne({
        where: { providerTransactionId: params.id },
      });
      if (payment) {
        this.appendCallbackLog(payment, { method, params });
        await this.paymentRepo.save(payment);
        await this.markAsCancelled(payment.id, `Cancelled by Payme (reason: ${params.reason})`);
      }

      return this.paymeService.successResponse(rpcId, {
        transaction: params.id,
        cancel_time: Date.now(),
        state: -1,
      });
    }

    // ── CheckTransaction ───────────────────────────────────────
    if (method === 'CheckTransaction') {
      const payment = await this.paymentRepo.findOne({
        where: { providerTransactionId: params.id },
      });

      let state = 1; // default: created
      if (payment?.status === PaymentStatus.PAID) state = 2;
      if (payment?.status === PaymentStatus.FAILED || payment?.status === PaymentStatus.CANCELLED) state = -1;

      return this.paymeService.successResponse(rpcId, {
        create_time: payment ? new Date(payment.createdAt).getTime() : 0,
        perform_time: payment?.paidAt ? new Date(payment.paidAt).getTime() : 0,
        cancel_time: 0,
        transaction: params.id,
        state,
        reason: null,
      });
    }

    return this.paymeService.errorResponse(rpcId, -32601, 'Method not found');
  }

  // ═══════════════════════════════════════════════════════════════
  //  CLICK WEBHOOKS — Prepare + Complete
  // ═══════════════════════════════════════════════════════════════

  async handleClickPrepare(params: Record<string, any>) {
    const orderId = params.merchant_trans_id;
    const payment = await this.getPaymentByOrderId(orderId);

    if (!payment) {
      return {
        error: -5,
        error_note: 'Order not found',
        click_trans_id: params.click_trans_id,
        merchant_trans_id: orderId,
      };
    }

    // Log raw callback
    this.appendCallbackLog(payment, { action: 'prepare', ...params });

    // Signature verification
    if (!this.clickService.verifySignature(params)) {
      this.logger.warn(`Click prepare: signature verification FAILED for ${orderId}`);
      await this.paymentRepo.save(payment);
      return {
        error: -1,
        error_note: 'Sign check failed',
        click_trans_id: params.click_trans_id,
        merchant_trans_id: orderId,
      };
    }

    if (payment.status !== PaymentStatus.PENDING) {
      await this.paymentRepo.save(payment);
      return {
        error: -4,
        error_note: 'Already processed',
        click_trans_id: params.click_trans_id,
        merchant_trans_id: orderId,
      };
    }

    // Store Click transaction reference
    payment.providerTransactionId = String(params.click_trans_id);
    payment.providerInvoiceId = String(params.click_trans_id);
    await this.paymentRepo.save(payment);

    return {
      click_trans_id: params.click_trans_id,
      merchant_trans_id: orderId,
      merchant_prepare_id: orderId,
      error: 0,
      error_note: 'Success',
    };
  }

  async handleClickComplete(params: Record<string, any>) {
    const orderId = params.merchant_trans_id;
    const payment = await this.getPaymentByOrderId(orderId);

    if (!payment) {
      return {
        error: -5,
        error_note: 'Order not found',
        click_trans_id: params.click_trans_id,
        merchant_trans_id: orderId,
      };
    }

    // Log raw callback
    this.appendCallbackLog(payment, { action: 'complete', ...params });

    // Signature verification
    if (!this.clickService.verifySignature(params)) {
      this.logger.warn(`Click complete: signature verification FAILED for ${orderId}`);
      await this.paymentRepo.save(payment);
      return {
        error: -1,
        error_note: 'Sign check failed',
        click_trans_id: params.click_trans_id,
        merchant_trans_id: orderId,
      };
    }

    // If Click reports an error
    if (params.error && Number(params.error) < 0) {
      await this.paymentRepo.save(payment);
      await this.markAsFailed(payment.id, 'Click reported error');
      return {
        click_trans_id: params.click_trans_id,
        merchant_trans_id: orderId,
        merchant_confirm_id: orderId,
        error: -9,
        error_note: 'Transaction cancelled',
      };
    }

    await this.paymentRepo.save(payment);
    // markAsPaid is idempotent — safe even if Click retries this callback
    await this.markAsPaid(payment.id, String(params.click_trans_id));

    return {
      click_trans_id: params.click_trans_id,
      merchant_trans_id: orderId,
      merchant_confirm_id: orderId,
      error: 0,
      error_note: 'Success',
    };
  }

  // ═══════════════════════════════════════════════════════════════
  //  MOCK CHECKOUT — for development / testing
  // ═══════════════════════════════════════════════════════════════

  async getMockCheckoutPage(orderId: string, returnUrl: string): Promise<string> {
    const payment = await this.getPaymentByOrderId(orderId);
    if (!payment) throw new NotFoundException('Payment not found');
    return this.mockCheckoutService.renderCheckoutPage(payment, returnUrl);
  }

  async confirmMockPayment(orderId: string): Promise<Payment> {
    const payment = await this.getPaymentByOrderId(orderId);
    if (!payment) throw new NotFoundException('Payment not found');

    this.appendCallbackLog(payment, {
      provider: 'mock',
      action: 'confirm',
      timestamp: new Date().toISOString(),
    });
    await this.paymentRepo.save(payment);

    return this.markAsPaid(payment.id, `mock_${Date.now()}`);
  }

  async failMockPayment(orderId: string): Promise<Payment> {
    const payment = await this.getPaymentByOrderId(orderId);
    if (!payment) throw new NotFoundException('Payment not found');

    this.appendCallbackLog(payment, {
      provider: 'mock',
      action: 'fail',
      timestamp: new Date().toISOString(),
    });
    await this.paymentRepo.save(payment);

    return this.markAsFailed(payment.id, 'User cancelled on mock checkout');
  }

  // ═══════════════════════════════════════════════════════════════
  //  ADMIN
  // ═══════════════════════════════════════════════════════════════

  async getPaymentStats() {
    const total = await this.paymentRepo.count();
    const paid = await this.paymentRepo.count({
      where: { status: PaymentStatus.PAID },
    });
    const pending = await this.paymentRepo.count({
      where: { status: PaymentStatus.PENDING },
    });
    const failed = await this.paymentRepo.count({
      where: { status: PaymentStatus.FAILED },
    });

    const revenue = await this.paymentRepo
      .createQueryBuilder('p')
      .select('SUM(p.amount)', 'total')
      .where('p.status = :status', { status: PaymentStatus.PAID })
      .getRawOne();

    return {
      totalPayments: total,
      paidPayments: paid,
      pendingPayments: pending,
      failedPayments: failed,
      totalRevenue: revenue?.total || 0,
    };
  }
}
