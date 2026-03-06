import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards';
import { Roles, CurrentUser } from '../common/decorators';
import { User, UserRole } from '../entities';

@ApiTags('Reports')
@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('company/:companyId/overview')
  @ApiOperation({ summary: 'Get financial overview for a company' })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  getFinancialOverview(
    @Param('companyId') companyId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.reportsService.getFinancialOverview(companyId, startDate, endDate);
  }

  @Get('company/:companyId/daily')
  @ApiOperation({ summary: 'Get daily report' })
  @ApiQuery({ name: 'date', required: true })
  getDailyReport(
    @Param('companyId') companyId: string,
    @Query('date') date: string,
  ) {
    return this.reportsService.getDailyReport(companyId, date);
  }

  @Get('company/:companyId/monthly')
  @ApiOperation({ summary: 'Get monthly report' })
  @ApiQuery({ name: 'year', required: true })
  @ApiQuery({ name: 'month', required: true })
  getMonthlyReport(
    @Param('companyId') companyId: string,
    @Query('year') year: string,
    @Query('month') month: string,
  ) {
    return this.reportsService.getMonthlyReport(companyId, +year, +month);
  }

  @Get('company/:companyId/kpis')
  @ApiOperation({ summary: 'Get company KPIs' })
  getKPIs(@Param('companyId') companyId: string) {
    return this.reportsService.getCompanyKPIs(companyId);
  }

  @Get('accounting-firm/:firmId/overview')
  @ApiOperation({ summary: 'Get overview of all client companies for accounting firm' })
  @Roles(UserRole.PLATFORM_ADMIN, UserRole.ACCOUNTANT_ADMIN, UserRole.ACCOUNTANT)
  getAccountingFirmOverview(@Param('firmId') firmId: string) {
    return this.reportsService.getAccountingFirmOverview(firmId);
  }
}
