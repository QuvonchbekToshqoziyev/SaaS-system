import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CounterpartiesService } from './counterparties.service';
import {
  CreateCounterpartyDto,
  UpdateCounterpartyDto,
} from './dto/counterparty.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards';
import { CurrentUser } from '../common/decorators';
import { User } from '../entities';

@ApiTags('Counterparties')
@Controller('counterparties')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class CounterpartiesController {
  constructor(private readonly cpService: CounterpartiesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new counterparty' })
  create(@Body() dto: CreateCounterpartyDto) {
    return this.cpService.create(dto);
  }

  @Get('company/:companyId')
  @ApiOperation({ summary: 'Get all counterparties for a company' })
  findAll(@Param('companyId') companyId: string) {
    return this.cpService.findAll(companyId);
  }

  @Get('company/:companyId/debt-report')
  @ApiOperation({ summary: 'Get debt report for a company' })
  getDebtReport(@Param('companyId') companyId: string) {
    return this.cpService.getDebtReport(companyId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get counterparty by ID' })
  findOne(@Param('id') id: string) {
    return this.cpService.findOne(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update counterparty' })
  update(@Param('id') id: string, @Body() dto: UpdateCounterpartyDto) {
    return this.cpService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Deactivate counterparty' })
  deactivate(@Param('id') id: string) {
    return this.cpService.deactivate(id);
  }
}
