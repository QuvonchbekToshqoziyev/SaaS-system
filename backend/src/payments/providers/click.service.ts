import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Payment } from '../../entities';
import * as crypto from 'crypto';

/**
 * ClickService — utility for Click hosted-checkout integration.
 *
 * Responsibilities:
 *   1. Generate hosted checkout URL (user is redirected here)
 *   2. Verify webhook signature (MD5)
 *   3. Return Click-protocol formatted responses
 *
 * All DB logic (lookup, state transitions) lives in PaymentsService.
 * This service never touches the database directly.
 *
 * Click docs: https://docs.click.uz/
 */
@Injectable()
export class ClickService {
  private readonly logger = new Logger(ClickService.name);
  private readonly merchantId: string;
  private readonly serviceId: string;
  private readonly secretKey: string;
  private readonly testMode: boolean;

  constructor(private configService: ConfigService) {
    this.merchantId = this.configService.get<string>('CLICK_MERCHANT_ID', 'test_merchant_id');
    this.serviceId = this.configService.get<string>('CLICK_SERVICE_ID', 'test_service_id');
    this.secretKey = this.configService.get<string>('CLICK_SECRET_KEY', 'test_secret_key');
    this.testMode = this.configService.get<string>('CLICK_TEST_MODE', 'true') === 'true';
  }

  /**
   * Generate Click hosted checkout URL.
   * User is redirected here — no card data touches our server.
   */
  generateCheckoutUrl(payment: Payment, returnUrl: string): string {
    const baseUrl = this.testMode
      ? 'https://test.click.uz/services/pay'
      : 'https://my.click.uz/services/pay';

    const params = new URLSearchParams({
      service_id: this.serviceId,
      merchant_id: this.merchantId,
      amount: String(payment.amount),
      transaction_param: payment.orderId,
      return_url: returnUrl,
    });

    return `${baseUrl}?${params.toString()}`;
  }

  /**
   * Verify Click callback signature.
   * sign_string = MD5(click_trans_id + service_id + secret_key + merchant_trans_id + amount + action + sign_time)
   */
  verifySignature(params: Record<string, any>): boolean {
    const {
      click_trans_id,
      service_id,
      merchant_trans_id,
      amount,
      action,
      sign_time,
      sign_string,
    } = params;

    const signSource = `${click_trans_id}${service_id}${this.secretKey}${merchant_trans_id}${amount}${action}${sign_time}`;
    const expectedSign = crypto.createHash('md5').update(signSource).digest('hex');

    return expectedSign === sign_string;
  }
}
