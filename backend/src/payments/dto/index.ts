import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod, BillingPeriod } from '../../entities';

export class CreatePaymentDto {
  @ApiProperty({ description: 'Company ID' })
  @IsString()
  companyId: string;

  @ApiProperty({ example: 'professional', description: 'Plan code to purchase' })
  @IsString()
  planCode: string;

  @ApiProperty({ enum: BillingPeriod })
  @IsEnum(BillingPeriod)
  billingPeriod: BillingPeriod;

  @ApiProperty({ enum: PaymentMethod, description: 'Payment provider (payme or click)' })
  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @ApiPropertyOptional({ description: 'URL to redirect user back after hosted checkout' })
  @IsOptional()
  @IsString()
  returnUrl?: string;
}
