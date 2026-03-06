import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { TransactionsService } from './transactions.service';
import { CreateTransactionDto, UpdateTransactionDto, FilterTransactionDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards';
import { Roles, CurrentUser } from '../common/decorators';
import { User, UserRole } from '../entities';

@ApiTags('Transactions')
@Controller('transactions')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new transaction' })
  create(@Body() dto: CreateTransactionDto, @CurrentUser() user: User) {
    return this.transactionsService.create(dto, user);
  }

  @Get('company/:companyId')
  @ApiOperation({ summary: 'Get all transactions for a company' })
  findAll(
    @Param('companyId') companyId: string,
    @Query() filters: FilterTransactionDto,
  ) {
    return this.transactionsService.findAll(companyId, filters);
  }

  @Get('company/:companyId/balance')
  @ApiOperation({ summary: 'Get balance for a company' })
  @ApiQuery({ name: 'currency', required: false })
  getBalance(
    @Param('companyId') companyId: string,
    @Query('currency') currency?: string,
  ) {
    return this.transactionsService.getBalance(companyId, currency);
  }

  @Get('company/:companyId/summary')
  @ApiOperation({ summary: 'Get transaction summary for a company' })
  @ApiQuery({ name: 'period', required: false, enum: ['daily', 'monthly', 'yearly'] })
  getSummary(
    @Param('companyId') companyId: string,
    @Query('period') period?: 'daily' | 'monthly' | 'yearly',
  ) {
    return this.transactionsService.getSummary(companyId, period);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get transaction by ID' })
  findOne(@Param('id') id: string) {
    return this.transactionsService.findOne(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update transaction' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTransactionDto,
    @CurrentUser() user: User,
  ) {
    return this.transactionsService.update(id, dto, user);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete transaction' })
  @Roles(
    UserRole.PLATFORM_ADMIN,
    UserRole.ACCOUNTANT_ADMIN,
    UserRole.ACCOUNTANT,
    UserRole.CLIENT_ADMIN,
  )
  delete(@Param('id') id: string, @CurrentUser() user: User) {
    return this.transactionsService.delete(id, user);
  }
}
