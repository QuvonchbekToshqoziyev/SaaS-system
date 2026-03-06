import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards';
import { Roles } from '../common/decorators';
import { UserRole } from '../entities';

@ApiTags('Audit')
@Controller('audit')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get('company/:companyId')
  @ApiOperation({ summary: 'Get audit logs for a company' })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'entityType', required: false })
  @ApiQuery({ name: 'action', required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @Roles(UserRole.PLATFORM_ADMIN, UserRole.ACCOUNTANT_ADMIN, UserRole.CLIENT_ADMIN)
  findAll(
    @Param('companyId') companyId: string,
    @Query('userId') userId?: string,
    @Query('entityType') entityType?: string,
    @Query('action') action?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.auditService.findAll(companyId, {
      userId,
      entityType,
      action,
      startDate,
      endDate,
      page: page ? +page : 1,
      limit: limit ? +limit : 50,
    });
  }

  @Get('company/:companyId/summary')
  @ApiOperation({ summary: 'Get activity summary for a company' })
  @Roles(UserRole.PLATFORM_ADMIN, UserRole.ACCOUNTANT_ADMIN, UserRole.CLIENT_ADMIN)
  getActivitySummary(@Param('companyId') companyId: string) {
    return this.auditService.getActivitySummary(companyId);
  }
}
