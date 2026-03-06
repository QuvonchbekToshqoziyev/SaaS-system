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
import { BranchesService } from './branches.service';
import { CreateBranchDto, UpdateBranchDto } from './dto/branch.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards';
import { Roles } from '../common/decorators';
import { UserRole } from '../entities';

@ApiTags('Branches')
@Controller('branches')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class BranchesController {
  constructor(private readonly branchesService: BranchesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new branch' })
  @Roles(UserRole.PLATFORM_ADMIN, UserRole.ACCOUNTANT_ADMIN, UserRole.CLIENT_ADMIN)
  create(@Body() dto: CreateBranchDto) {
    return this.branchesService.create(dto);
  }

  @Get('company/:companyId')
  @ApiOperation({ summary: 'Get all branches for a company' })
  findAll(@Param('companyId') companyId: string) {
    return this.branchesService.findAll(companyId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get branch by ID' })
  findOne(@Param('id') id: string) {
    return this.branchesService.findOne(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update branch' })
  update(@Param('id') id: string, @Body() dto: UpdateBranchDto) {
    return this.branchesService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Deactivate branch' })
  @Roles(UserRole.PLATFORM_ADMIN, UserRole.ACCOUNTANT_ADMIN, UserRole.CLIENT_ADMIN)
  deactivate(@Param('id') id: string) {
    return this.branchesService.deactivate(id);
  }
}
