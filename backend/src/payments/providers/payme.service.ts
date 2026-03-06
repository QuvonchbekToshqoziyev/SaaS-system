import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Payment } from '../../entities';

/**
 * PaymeService — utility for Payme hosted-checkout integration.
 *
 * Responsibilities:
 *   1. Generate hosted checkout URL (user is redirected here)
 *   2. Verify webhook Basic Auth header
 *   3. Build JSON-RPC response helpers
 *
 * All DB logic (lookup, state transitions) lives in PaymentsService.
 * This service never touches the database directly.
 *
 * Payme docs: https://developer.help.paycom.uz/
 */
@Injectable()
export class PaymeService {
  private readonly logger = new Logger(PaymeService.name);
  private readonly merchantId: string;
  private readonly merchantKey: string;
  private readonly testMode: boolean;
  private readonly baseCheckoutUrl: string;

  constructor(private configService: ConfigService) {
    this.merchantId = this.configService.get<string>('PAYME_MERCHANT_ID', 'test_merchant_id');
    this.merchantKey = this.configService.get<string>('PAYME_MERCHANT_KEY', 'test_merchant_key');
    this.testMode = this.configService.get<string>('PAYME_TEST_MODE', 'true') === 'true';
    this.baseCheckoutUrl = this.testMode
      ? 'https://test.paycom.uz'
      : 'https://checkout.paycom.uz';
  }

  /**
   * Generate Payme hosted checkout URL.
   * User is redirected here — no card data touches our server.
   * Amount is converted to tiyin (1 UZS = 100 tiyin).
   */
  generateCheckoutUrl(payment: Payment, returnUrl: string): string {
    const amountInTiyin = Math.round(Number(payment.amount) * 100);
    const params = Buffer.from(
      `m=${this.merchantId};ac.order_id=${payment.orderId};a=${amountInTiyin};c=${returnUrl}`,
    ).toString('base64');
    return `${this.baseCheckoutUrl}/${params}`;
  }

  /**
   * Verify Payme webhook request authenticity via Basic Auth.
   * Payme sends: Authorization: Basic base64(Paycom:<merchant_key>)
   */
  verifyWebhookAuth(authHeader: string): boolean {
    if (!authHeader || !authHeader.startsWith('Basic ')) return false;
    try {
      const decoded = Buffer.from(authHeader.replace('Basic ', ''), 'base64').toString('utf8');
      const [, key] = decoded.split(':');
      return key === this.merchantKey;
    } catch {
      return false;
    }
  }

  // ─── JSON-RPC response helpers ────────────────────────────────

  successResponse(id: string, result: any) {
    return { jsonrpc: '2.0', id, result };
  }

  errorResponse(id: string, code: number, message: string) {
    return {
      jsonrpc: '2.0',
      id,
      error: { code, message: { uz: message, ru: message, en: message } },
    };
  }
}
