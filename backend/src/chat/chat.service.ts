import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { ChatRoom, ChatMessage, User, MessageType } from '../entities';
import { CreateChatRoomDto, SendMessageDto } from './dto/chat.dto';

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(ChatRoom) private roomRepo: Repository<ChatRoom>,
    @InjectRepository(ChatMessage) private messageRepo: Repository<ChatMessage>,
    @InjectRepository(User) private userRepo: Repository<User>,
  ) {}

  async createRoom(dto: CreateChatRoomDto, creatorId: string) {
    // Ensure creator is included in participants
    const participantIds = [...new Set([...dto.participantIds, creatorId])];
    const participants = await this.userRepo.findBy({
      id: In(participantIds),
    });

    const room = this.roomRepo.create({
      name: dto.name,
      type: dto.type,
      companyId: dto.companyId,
      participants,
    });

    const savedRoom = await this.roomRepo.save(room);

    // Send system message
    const systemMsg = this.messageRepo.create({
      content: 'Chat room created',
      type: MessageType.SYSTEM,
      roomId: savedRoom.id,
      senderId: creatorId,
    });
    await this.messageRepo.save(systemMsg);

    return savedRoom;
  }

  async getUserRooms(userId: string) {
    const rooms = await this.roomRepo
      .createQueryBuilder('room')
      .leftJoinAndSelect('room.participants', 'participant')
      .leftJoin('chat_room_participants', 'crp', 'crp.roomId = room.id')
      .where('crp.userId = :userId', { userId })
      .andWhere('room.isActive = true')
      .select([
        'room.id',
        'room.name',
        'room.type',
        'room.companyId',
        'room.createdAt',
        'room.updatedAt',
        'participant.id',
        'participant.firstName',
        'participant.lastName',
        'participant.email',
        'participant.avatarUrl',
        'participant.role',
      ])
      .getMany();

    // Get last message for each room
    const roomsWithLastMessage = await Promise.all(
      rooms.map(async (room) => {
        const lastMessage = await this.messageRepo.findOne({
          where: { roomId: room.id },
          order: { createdAt: 'DESC' },
          relations: ['sender'],
        });

        const unreadCount = await this.messageRepo.count({
          where: {
            roomId: room.id,
            isRead: false,
          },
        });

        return {
          ...room,
          lastMessage: lastMessage
            ? {
                content: lastMessage.content,
                type: lastMessage.type,
                senderName: `${lastMessage.sender?.firstName} ${lastMessage.sender?.lastName}`,
                createdAt: lastMessage.createdAt,
              }
            : null,
          unreadCount,
        };
      }),
    );

    return roomsWithLastMessage;
  }

  async getRoomMessages(roomId: string, userId: string, page = 1, limit = 50) {
    // Verify user is participant
    const room = await this.roomRepo
      .createQueryBuilder('room')
      .leftJoin('chat_room_participants', 'crp', 'crp.roomId = room.id')
      .where('room.id = :roomId', { roomId })
      .andWhere('crp.userId = :userId', { userId })
      .getOne();

    if (!room) {
      throw new ForbiddenException('You are not a participant of this room');
    }

    const [messages, total] = await this.messageRepo.findAndCount({
      where: { roomId },
      relations: ['sender'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    // Mark messages as read
    await this.messageRepo
      .createQueryBuilder()
      .update(ChatMessage)
      .set({ isRead: true })
      .where('roomId = :roomId AND senderId != :userId AND isRead = false', {
        roomId,
        userId,
      })
      .execute();

    return {
      messages: messages.reverse(),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async sendMessage(roomId: string, senderId: string, dto: SendMessageDto) {
    // Verify sender is participant
    const room = await this.roomRepo
      .createQueryBuilder('room')
      .leftJoin('chat_room_participants', 'crp', 'crp.roomId = room.id')
      .where('room.id = :roomId', { roomId })
      .andWhere('crp.userId = :senderId', { senderId })
      .getOne();

    if (!room) {
      throw new ForbiddenException('You are not a participant of this room');
    }

    const message = this.messageRepo.create({
      content: dto.content,
      type: dto.type || MessageType.TEXT,
      fileUrl: dto.fileUrl,
      fileName: dto.fileName,
      roomId,
      senderId,
    });

    const saved = await this.messageRepo.save(message);

    // Return with sender info
    return this.messageRepo.findOne({
      where: { id: saved.id },
      relations: ['sender'],
    });
  }

  async addParticipant(roomId: string, userId: string) {
    const room = await this.roomRepo.findOne({
      where: { id: roomId },
      relations: ['participants'],
    });
    if (!room) throw new NotFoundException('Chat room not found');

    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    if (!room.participants.find((p) => p.id === userId)) {
      room.participants.push(user);
      await this.roomRepo.save(room);

      // System message
      const msg = this.messageRepo.create({
        content: `${user.firstName} ${user.lastName} joined the chat`,
        type: MessageType.SYSTEM,
        roomId,
        senderId: userId,
      });
      await this.messageRepo.save(msg);
    }

    return room;
  }

  async removeParticipant(roomId: string, userId: string) {
    const room = await this.roomRepo.findOne({
      where: { id: roomId },
      relations: ['participants'],
    });
    if (!room) throw new NotFoundException('Chat room not found');

    room.participants = room.participants.filter((p) => p.id !== userId);
    return this.roomRepo.save(room);
  }

  async getRoomDetails(roomId: string) {
    const room = await this.roomRepo.findOne({
      where: { id: roomId },
      relations: ['participants'],
    });
    if (!room) throw new NotFoundException('Chat room not found');
    return room;
  }
}
