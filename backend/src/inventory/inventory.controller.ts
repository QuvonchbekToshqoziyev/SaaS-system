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
import { InventoryService } from './inventory.service';
import {
  CreateInventoryItemDto,
  UpdateInventoryItemDto,
} from './dto/inventory-item.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards';
import { CurrentUser } from '../common/decorators';
import { User } from '../entities';

@ApiTags('Inventory')
@Controller('inventory')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new inventory item' })
  create(@Body() dto: CreateInventoryItemDto) {
    return this.inventoryService.create(dto);
  }

  @Get('company/:companyId')
  @ApiOperation({ summary: 'Get all inventory items for a company' })
  @ApiQuery({ name: 'includeDeleted', required: false })
  findAll(
    @Param('companyId') companyId: string,
    @Query('includeDeleted') includeDeleted?: string,
  ) {
    return this.inventoryService.findAll(companyId, includeDeleted === 'true');
  }

  @Get('company/:companyId/low-stock')
  @ApiOperation({ summary: 'Get low stock items' })
  getLowStock(@Param('companyId') companyId: string) {
    return this.inventoryService.getLowStockItems(companyId);
  }

  @Get('company/:companyId/value')
  @ApiOperation({ summary: 'Get total inventory value' })
  getValue(@Param('companyId') companyId: string) {
    return this.inventoryService.getInventoryValue(companyId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get inventory item by ID' })
  findOne(@Param('id') id: string) {
    return this.inventoryService.findOne(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update inventory item' })
  update(@Param('id') id: string, @Body() dto: UpdateInventoryItemDto) {
    return this.inventoryService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft delete inventory item' })
  softDelete(@Param('id') id: string) {
    return this.inventoryService.softDelete(id);
  }

  @Put(':id/restore')
  @ApiOperation({ summary: 'Restore soft-deleted inventory item' })
  restore(@Param('id') id: string) {
    return this.inventoryService.restore(id);
  }
}
