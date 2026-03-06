import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  Res,
  UseGuards,
  Headers,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards';
import { Roles, CurrentUser } from '../common/decorators';
import { User, UserRole } from '../entities';

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  // ═══════════════════════════════════════════════════════════════
  //  AUTHENTICATED ENDPOINTS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Create a payment record (status=pending) and return a hosted checkout URL.
   * Frontend MUST redirect user to `paymentUrl` — never collect card details.
   */
  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create payment → get hosted checkout URL' })
  createPayment(@Body() dto: CreatePaymentDto, @CurrentUser() user: User) {
    return this.paymentsService.createPayment(dto, user.id);
  }

  /**
   * Poll payment status — used by frontend after redirect back from provider.
   * This is the ONLY way frontend determines payment outcome (not redirect params).
   */
  @Get(':id/status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get payment status (for polling)' })
  getPaymentStatus(@Param('id') id: string) {
    return this.paymentsService.getPaymentStatus(id);
  }

  @Get('company/:companyId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all payments for a company' })
  getCompanyPayments(@Param('companyId') companyId: string) {
    return this.paymentsService.getCompanyPayments(companyId);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get full payment details' })
  getPayment(@Param('id') id: string) {
    return this.paymentsService.getPayment(id);
  }

  // ─── Admin ────────────────────────────────────────────────────

  @Get('stats/overview')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @Roles(UserRole.PLATFORM_ADMIN)
  @ApiOperation({ summary: 'Payment statistics (admin)' })
  getStats() {
    return this.paymentsService.getPaymentStats();
  }

  // ═══════════════════════════════════════════════════════════════
  //  PROVIDER WEBHOOKS — no auth guard, called by payment providers
  // ═══════════════════════════════════════════════════════════════

  /**
   * Payme JSON-RPC webhook.
   * Payme authenticates via Basic Auth header — verified in service.
   */
  @Post('webhook/payme')
  @HttpCode(200)
  @ApiOperation({ summary: 'Payme webhook (JSON-RPC)' })
  handlePaymeWebhook(
    @Body() body: any,
    @Headers('authorization') authHeader: string,
  ) {
    return this.paymentsService.handlePaymeWebhook(body, authHeader || '');
  }

  /**
   * Click "Prepare" callback (action=0).
   * Click authenticates via MD5 signature — verified in service.
   */
  @Post('webhook/click/prepare')
  @HttpCode(200)
  @ApiOperation({ summary: 'Click Prepare callback' })
  handleClickPrepare(@Body() body: any) {
    return this.paymentsService.handleClickPrepare(body);
  }

  /**
   * Click "Complete" callback (action=1).
   */
  @Post('webhook/click/complete')
  @HttpCode(200)
  @ApiOperation({ summary: 'Click Complete callback' })
  handleClickComplete(@Body() body: any) {
    return this.paymentsService.handleClickComplete(body);
  }

  // ═══════════════════════════════════════════════════════════════
  //  MOCK CHECKOUT — development only (simulates provider page)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Serves a mock checkout HTML page (like a payment provider would).
   * Only active when PAYMENT_MOCK_ENABLED=true.
   */
  @Get('mock-checkout/:orderId')
  @ApiOperation({ summary: 'Mock checkout page (dev only)' })
  async mockCheckoutPage(
    @Param('orderId') orderId: string,
    @Query('return_url') returnUrl: string,
    @Res() res: Response,
  ) {
    const html = await this.paymentsService.getMockCheckoutPage(
      orderId,
      returnUrl || 'http://localhost:3000/subscriptions',
    );
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  }

  /**
   * Mock: simulate successful payment → mark as paid → redirect back.
   */
  @Post('mock-checkout/:orderId/confirm')
  @ApiOperation({ summary: 'Mock confirm payment (dev only)' })
  async mockConfirm(
    @Param('orderId') orderId: string,
    @Body('return_url') returnUrl: string,
    @Res() res: Response,
  ) {
    const payment = await this.paymentsService.confirmMockPayment(orderId);
    const target = returnUrl
      ? `${returnUrl}${returnUrl.includes('?') ? '&' : '?'}payment=return&paymentId=${payment.id}`
      : `http://localhost:3000/subscriptions?payment=return&paymentId=${payment.id}`;
    res.redirect(302, target);
  }

  /**
   * Mock: simulate failed payment → mark as failed → redirect back.
   */
  @Post('mock-checkout/:orderId/fail')
  @ApiOperation({ summary: 'Mock fail payment (dev only)' })
  async mockFail(
    @Param('orderId') orderId: string,
    @Body('return_url') returnUrl: string,
    @Res() res: Response,
  ) {
    await this.paymentsService.failMockPayment(orderId);
    const target = returnUrl
      ? `${returnUrl}${returnUrl.includes('?') ? '&' : '?'}payment=failed`
      : `http://localhost:3000/subscriptions?payment=failed`;
    res.redirect(302, target);
  }
}
