import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaymeService } from './providers/payme.service';
import { ClickService } from './providers/click.service';
import { MockCheckoutService } from './providers/mock-checkout.service';
import { Payment, SubscriptionPlanDetail, Company } from '../entities';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment, SubscriptionPlanDetail, Company]),
    SubscriptionsModule,
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService, PaymeService, ClickService, MockCheckoutService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
