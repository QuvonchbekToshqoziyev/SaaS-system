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
import { CompaniesService } from './companies.service';
import { CreateCompanyDto, UpdateCompanyDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards';
import { Roles, CurrentUser } from '../common/decorators';
import { User, UserRole } from '../entities';

@ApiTags('Companies')
@Controller('companies')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new company' })
  @Roles(UserRole.PLATFORM_ADMIN, UserRole.ACCOUNTANT_ADMIN)
  create(@Body() dto: CreateCompanyDto) {
    return this.companiesService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all companies (filtered by role)' })
  findAll(@CurrentUser() user: User) {
    return this.companiesService.findAll(user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get company by ID' })
  findOne(@Param('id') id: string) {
    return this.companiesService.findOne(id);
  }

  @Get(':id/clients')
  @ApiOperation({ summary: 'Get client companies of an accounting firm' })
  @Roles(UserRole.PLATFORM_ADMIN, UserRole.ACCOUNTANT_ADMIN, UserRole.ACCOUNTANT)
  getClients(@Param('id') id: string) {
    return this.companiesService.getClientCompanies(id);
  }

  @Get(':id/dashboard')
  @ApiOperation({ summary: 'Get company dashboard stats' })
  getDashboardStats(@Param('id') id: string) {
    return this.companiesService.getDashboardStats(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update company' })
  @Roles(UserRole.PLATFORM_ADMIN, UserRole.ACCOUNTANT_ADMIN, UserRole.CLIENT_ADMIN)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCompanyDto,
    @CurrentUser() user: User,
  ) {
    return this.companiesService.update(id, dto, user);
  }
}
