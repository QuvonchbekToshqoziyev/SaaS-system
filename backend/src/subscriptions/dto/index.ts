import { IsEnum, IsOptional, IsNumber, IsString, IsArray, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PlanCode } from '../../entities';

export class CreatePlanDto {
  @ApiProperty({ example: 'Asosiy' })
  @IsString()
  name: string;

  @ApiProperty({ enum: PlanCode })
  @IsEnum(PlanCode)
  code: PlanCode;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 299000 })
  @IsNumber()
  monthlyPrice: number;

  @ApiProperty({ example: 2990000 })
  @IsNumber()
  yearlyPrice: number;

  @ApiPropertyOptional({ example: 'UZS' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ example: ['Hisobotlar', 'Chat', 'Filiallar'] })
  @IsOptional()
  @IsArray()
  features?: string[];

  @ApiPropertyOptional({ example: { maxUsers: 5, maxBranches: 2 } })
  @IsOptional()
  limits?: Record<string, number>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  sortOrder?: number;
}

export class UpdatePlanDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  monthlyPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  yearlyPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  features?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  limits?: Record<string, number>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  sortOrder?: number;
}
