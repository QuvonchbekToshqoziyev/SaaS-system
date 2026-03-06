import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SubscriptionsService } from '../../subscriptions/subscriptions.service';

export const SUBSCRIPTION_KEY = 'requiredSubscription';
export const RequireSubscription = (...features: string[]) =>
  Reflect.metadata(SUBSCRIPTION_KEY, features);

/**
 * Guard that checks if the user's company has an active subscription
 * with access to the required features.
 *
 * Usage:
 *   @RequireSubscription('reports', 'inventory')
 *   @UseGuards(JwtAuthGuard, SubscriptionGuard)
 */
@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private subscriptionsService: SubscriptionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredFeatures = this.reflector.getAllAndOverride<string[]>(
      SUBSCRIPTION_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If no features required, allow access
    if (!requiredFeatures || requiredFeatures.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    if (!user?.companyId) {
      throw new ForbiddenException('No company associated with user');
    }

    // Check subscription status
    const sub = await this.subscriptionsService.getCompanySubscription(user.companyId);

    if (!sub.isActive) {
      throw new ForbiddenException(
        'Obuna muddati tugagan. Davom etish uchun obunani yangilang. / Subscription expired. Please renew to continue.',
      );
    }

    // Check each required feature
    for (const feature of requiredFeatures) {
      const hasAccess = await this.subscriptionsService.checkFeatureAccess(
        user.companyId,
        feature,
      );
      if (!hasAccess) {
        throw new ForbiddenException(
          `Bu xizmatdan foydalanish uchun obunangizni yangilang: ${feature} / Upgrade your subscription to access: ${feature}`,
        );
      }
    }

    return true;
  }
}
