import { IsNotEmpty, IsString, IsOptional, IsEnum, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ChatRoomType, MessageType } from '../../entities';

export class CreateChatRoomDto {
  @ApiPropertyOptional({ example: 'Tax Documents Discussion' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ enum: ChatRoomType })
  @IsEnum(ChatRoomType)
  type: ChatRoomType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  companyId?: string;

  @ApiProperty({ description: 'Array of user IDs to add as participants' })
  @IsArray()
  @IsString({ each: true })
  participantIds: string[];
}

export class SendMessageDto {
  @ApiProperty({ example: 'Please review the Q4 report' })
  @IsString()
  @IsNotEmpty()
  content: string;

  @ApiPropertyOptional({ enum: MessageType })
  @IsOptional()
  @IsEnum(MessageType)
  type?: MessageType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fileUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fileName?: string;
}
