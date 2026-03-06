import { IsNotEmpty, IsString, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CompanyType } from '../../entities';

export class CreateCompanyDto {
  @ApiProperty({ example: 'Aniq Hisob LLC' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ enum: CompanyType })
  @IsEnum(CompanyType)
  type: CompanyType;

  @ApiPropertyOptional({ example: '123456789' })
  @IsOptional()
  @IsString()
  inn?: string;

  @ApiPropertyOptional({ example: 'Tashkent, Uzbekistan' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ example: '+998712345678' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'info@aniqhisob.uz' })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional({ description: 'ID of the accounting firm managing this client' })
  @IsOptional()
  @IsString()
  accountingFirmId?: string;
}
