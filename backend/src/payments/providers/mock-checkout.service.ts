import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Payment } from '../../entities';

/**
 * MockCheckoutService — simulates a provider-hosted checkout for development.
 *
 * In development / test mode, this service generates a URL that points
 * to our own backend mock-checkout endpoint. That endpoint renders a
 * minimal HTML "Pay" page. When the user clicks "Pay", the backend
 * confirms the payment internally and redirects back to the frontend.
 *
 * This exercises the full redirect flow (create → redirect → callback → activate)
 * without any real payment provider.
 */
@Injectable()
export class MockCheckoutService {
  private readonly logger = new Logger(MockCheckoutService.name);
  private readonly enabled: boolean;
  private readonly baseUrl: string;

  constructor(private configService: ConfigService) {
    this.enabled =
      this.configService.get<string>('PAYMENT_MOCK_ENABLED', 'true') === 'true';
    this.baseUrl = this.configService.get<string>(
      'APP_BASE_URL',
      'http://localhost:3000',
    );
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Generate a URL that points to our own mock checkout page.
   */
  generateCheckoutUrl(payment: Payment, returnUrl: string): string {
    return `${this.baseUrl}/api/v1/payments/mock-checkout/${payment.orderId}?return_url=${encodeURIComponent(returnUrl)}`;
  }

  /**
   * Render a minimal HTML checkout page that simulates a payment provider.
   */
  renderCheckoutPage(payment: Payment, returnUrl: string): string {
    const amount = Number(payment.amount).toLocaleString('uz-UZ');
    return `<!DOCTYPE html>
<html lang="uz">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Mock Checkout — ${payment.orderId}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f0f2f5; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .card { background: #fff; border-radius: 16px; box-shadow: 0 4px 24px rgba(0,0,0,.1); max-width: 420px; width: 100%; padding: 40px 32px; text-align: center; }
    .badge { display: inline-block; background: #FEF3C7; color: #92400E; padding: 4px 12px; border-radius: 8px; font-size: 12px; font-weight: 600; margin-bottom: 20px; }
    h1 { font-size: 22px; color: #111827; margin-bottom: 8px; }
    .amount { font-size: 36px; font-weight: 800; color: #4361EE; margin: 16px 0; }
    .details { color: #6B7280; font-size: 14px; margin-bottom: 24px; line-height: 1.6; }
    .details span { color: #111827; font-weight: 600; }
    .btn { display: inline-block; width: 100%; padding: 14px 24px; border-radius: 12px; border: none; font-size: 16px; font-weight: 700; cursor: pointer; transition: all .2s; text-decoration: none; }
    .btn-pay { background: linear-gradient(135deg, #4361EE, #7C3AED); color: #fff; margin-bottom: 12px; }
    .btn-pay:hover { transform: translateY(-1px); box-shadow: 0 8px 24px rgba(67,97,238,.3); }
    .btn-cancel { background: #F3F4F6; color: #6B7280; }
    .btn-cancel:hover { background: #E5E7EB; }
    .footer { margin-top: 20px; font-size: 11px; color: #9CA3AF; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">⚠️ TEST / DEVELOPMENT MODE</div>
    <h1>Mock Payment Checkout</h1>
    <div class="amount">${amount} so'm</div>
    <div class="details">
      Order: <span>${payment.orderId}</span><br>
      Plan: <span>${payment.planCode}</span><br>
      Period: <span>${payment.billingPeriod}</span>
    </div>
    <form method="POST" action="${this.baseUrl}/api/v1/payments/mock-checkout/${payment.orderId}/confirm">
      <input type="hidden" name="return_url" value="${returnUrl}" />
      <button type="submit" class="btn btn-pay">✅ Simulate Successful Payment</button>
    </form>
    <br/>
    <form method="POST" action="${this.baseUrl}/api/v1/payments/mock-checkout/${payment.orderId}/fail">
      <input type="hidden" name="return_url" value="${returnUrl}" />
      <button type="submit" class="btn btn-cancel">❌ Simulate Failed Payment</button>
    </form>
    <div class="footer">
      This is a mock checkout page for development only.<br>
      In production, users are redirected to Payme or Click.
    </div>
  </div>
</body>
</html>`;
  }
}
