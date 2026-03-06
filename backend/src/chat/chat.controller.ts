import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  Delete,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ChatService } from './chat.service';
import { CreateChatRoomDto, SendMessageDto } from './dto/chat.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators';
import { User } from '../entities';

@ApiTags('Chat')
@Controller('chat')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('rooms')
  @ApiOperation({ summary: 'Create a new chat room' })
  createRoom(@Body() dto: CreateChatRoomDto, @CurrentUser() user: User) {
    return this.chatService.createRoom(dto, user.id);
  }

  @Get('rooms')
  @ApiOperation({ summary: 'Get all chat rooms for current user' })
  getUserRooms(@CurrentUser() user: User) {
    return this.chatService.getUserRooms(user.id);
  }

  @Get('rooms/:roomId')
  @ApiOperation({ summary: 'Get chat room details' })
  getRoomDetails(@Param('roomId') roomId: string) {
    return this.chatService.getRoomDetails(roomId);
  }

  @Get('rooms/:roomId/messages')
  @ApiOperation({ summary: 'Get messages in a chat room' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  getMessages(
    @Param('roomId') roomId: string,
    @CurrentUser() user: User,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.chatService.getRoomMessages(
      roomId,
      user.id,
      page ? +page : 1,
      limit ? +limit : 50,
    );
  }

  @Post('rooms/:roomId/messages')
  @ApiOperation({ summary: 'Send a message in a chat room' })
  sendMessage(
    @Param('roomId') roomId: string,
    @Body() dto: SendMessageDto,
    @CurrentUser() user: User,
  ) {
    return this.chatService.sendMessage(roomId, user.id, dto);
  }

  @Post('rooms/:roomId/participants/:userId')
  @ApiOperation({ summary: 'Add a participant to chat room' })
  addParticipant(
    @Param('roomId') roomId: string,
    @Param('userId') userId: string,
  ) {
    return this.chatService.addParticipant(roomId, userId);
  }

  @Delete('rooms/:roomId/participants/:userId')
  @ApiOperation({ summary: 'Remove a participant from chat room' })
  removeParticipant(
    @Param('roomId') roomId: string,
    @Param('userId') userId: string,
  ) {
    return this.chatService.removeParticipant(roomId, userId);
  }
}
