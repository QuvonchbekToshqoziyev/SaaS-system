import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SubscriptionsService } from './subscriptions.service';
import { CreatePlanDto, UpdatePlanDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards';
import { Roles, CurrentUser } from '../common/decorators';
import { User, UserRole, PlanCode } from '../entities';

@ApiTags('Subscriptions')
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  // ─── Public: get all plans (no auth needed for pricing page) ──
  @Get('plans')
  @ApiOperation({ summary: 'Get all subscription plans' })
  getPlans() {
    return this.subscriptionsService.findAllPlans();
  }

  @Get('plans/:code')
  @ApiOperation({ summary: 'Get plan by code' })
  getPlanByCode(@Param('code') code: PlanCode) {
    return this.subscriptionsService.findPlanByCode(code);
  }

  // ─── Admin: manage plans ──────────────────────────────────────
  @Post('plans')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create subscription plan (admin only)' })
  @Roles(UserRole.PLATFORM_ADMIN)
  createPlan(@Body() dto: CreatePlanDto) {
    return this.subscriptionsService.createPlan(dto);
  }

  @Put('plans/:code')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update subscription plan (admin only)' })
  @Roles(UserRole.PLATFORM_ADMIN)
  updatePlan(@Param('code') code: PlanCode, @Body() dto: UpdatePlanDto) {
    return this.subscriptionsService.updatePlan(code, dto);
  }

  // ─── Company subscription info ────────────────────────────────
  @Get('company/:companyId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get company subscription status' })
  getCompanySubscription(@Param('companyId') companyId: string) {
    return this.subscriptionsService.getCompanySubscription(companyId);
  }

  @Get('company/:companyId/check/:feature')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Check if company has access to a feature' })
  checkFeature(
    @Param('companyId') companyId: string,
    @Param('feature') feature: string,
  ) {
    return this.subscriptionsService.checkFeatureAccess(companyId, feature);
  }
}
