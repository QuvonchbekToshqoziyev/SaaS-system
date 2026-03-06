import {
  Controller,
  Get,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards';
import { Roles, CurrentUser } from '../common/decorators';
import { User, UserRole } from '../entities';

@ApiTags('Users')
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Get all users (filtered by role permissions)' })
  findAll(@CurrentUser() user: User) {
    return this.usersService.findAll(user);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get user statistics' })
  @Roles(UserRole.PLATFORM_ADMIN, UserRole.ACCOUNTANT_ADMIN, UserRole.CLIENT_ADMIN)
  getStats(@CurrentUser() user: User) {
    return this.usersService.getStats(
      user.role === UserRole.PLATFORM_ADMIN ? undefined : user.companyId,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user by ID' })
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update user' })
  @Roles(UserRole.PLATFORM_ADMIN, UserRole.ACCOUNTANT_ADMIN, UserRole.CLIENT_ADMIN)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: User,
  ) {
    return this.usersService.update(id, dto, user);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Deactivate user' })
  @Roles(UserRole.PLATFORM_ADMIN, UserRole.ACCOUNTANT_ADMIN, UserRole.CLIENT_ADMIN)
  deactivate(@Param('id') id: string, @CurrentUser() user: User) {
    return this.usersService.deactivate(id, user);
  }
}
