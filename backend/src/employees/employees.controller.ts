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
import { EmployeesService } from './employees.service';
import {
  CreateEmployeeDto,
  UpdateEmployeeDto,
  UpdateSalaryDto,
} from './dto/employee.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards';
import { Roles, CurrentUser } from '../common/decorators';
import { User, UserRole } from '../entities';

@ApiTags('Employees')
@Controller('employees')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new employee' })
  @Roles(UserRole.PLATFORM_ADMIN, UserRole.ACCOUNTANT_ADMIN, UserRole.CLIENT_ADMIN)
  create(@Body() dto: CreateEmployeeDto) {
    return this.employeesService.create(dto);
  }

  @Get('company/:companyId')
  @ApiOperation({ summary: 'Get all employees for a company' })
  findAll(@Param('companyId') companyId: string) {
    return this.employeesService.findAll(companyId);
  }

  @Get('company/:companyId/payroll')
  @ApiOperation({ summary: 'Get payroll summary for a company' })
  @Roles(UserRole.PLATFORM_ADMIN, UserRole.ACCOUNTANT_ADMIN, UserRole.ACCOUNTANT, UserRole.CLIENT_ADMIN)
  getPayroll(@Param('companyId') companyId: string) {
    return this.employeesService.getPayrollSummary(companyId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get employee by ID' })
  findOne(@Param('id') id: string) {
    return this.employeesService.findOne(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update employee' })
  update(@Param('id') id: string, @Body() dto: UpdateEmployeeDto) {
    return this.employeesService.update(id, dto);
  }

  @Put(':id/salary')
  @ApiOperation({ summary: 'Update employee salary with history' })
  @Roles(UserRole.PLATFORM_ADMIN, UserRole.ACCOUNTANT_ADMIN, UserRole.CLIENT_ADMIN)
  updateSalary(@Param('id') id: string, @Body() dto: UpdateSalaryDto) {
    return this.employeesService.updateSalary(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Deactivate employee' })
  @Roles(UserRole.PLATFORM_ADMIN, UserRole.ACCOUNTANT_ADMIN, UserRole.CLIENT_ADMIN)
  deactivate(@Param('id') id: string) {
    return this.employeesService.deactivate(id);
  }
}
