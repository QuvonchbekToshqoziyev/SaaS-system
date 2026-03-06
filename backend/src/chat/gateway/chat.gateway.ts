import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ChatService } from '../chat.service';
import { MessageType } from '../../entities';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: '/chat',
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private connectedUsers: Map<string, string[]> = new Map(); // userId -> socketIds

  constructor(
    private jwtService: JwtService,
    private chatService: ChatService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token || client.handshake.headers?.authorization?.split(' ')[1];
      if (!token) {
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token);
      const userId = payload.sub;
      client.data.userId = userId;

      // Track connected users
      const existing = this.connectedUsers.get(userId) || [];
      existing.push(client.id);
      this.connectedUsers.set(userId, existing);

      // Join user's rooms
      const rooms = await this.chatService.getUserRooms(userId);
      rooms.forEach((room: any) => {
        client.join(`room:${room.id}`);
      });

      // Notify others
      this.server.emit('userOnline', { userId });
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const userId = client.data.userId;
    if (userId) {
      const sockets = this.connectedUsers.get(userId) || [];
      const filtered = sockets.filter((id) => id !== client.id);
      if (filtered.length === 0) {
        this.connectedUsers.delete(userId);
        this.server.emit('userOffline', { userId });
      } else {
        this.connectedUsers.set(userId, filtered);
      }
    }
  }

  @SubscribeMessage('sendMessage')
  async handleMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; content: string; type?: string; fileUrl?: string; fileName?: string },
  ) {
    const userId = client.data.userId;
    if (!userId) return;

    const message = await this.chatService.sendMessage(data.roomId, userId, {
      content: data.content,
      type: (data.type as MessageType) || MessageType.TEXT,
      fileUrl: data.fileUrl,
      fileName: data.fileName,
    });

    // Broadcast to room
    this.server.to(`room:${data.roomId}`).emit('newMessage', message);
    return message;
  }

  @SubscribeMessage('joinRoom')
  async handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string },
  ) {
    client.join(`room:${data.roomId}`);
    return { status: 'joined', roomId: data.roomId };
  }

  @SubscribeMessage('leaveRoom')
  handleLeaveRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string },
  ) {
    client.leave(`room:${data.roomId}`);
    return { status: 'left', roomId: data.roomId };
  }

  @SubscribeMessage('typing')
  handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string },
  ) {
    const userId = client.data.userId;
    client.to(`room:${data.roomId}`).emit('userTyping', {
      userId,
      roomId: data.roomId,
    });
  }

  @SubscribeMessage('stopTyping')
  handleStopTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string },
  ) {
    const userId = client.data.userId;
    client.to(`room:${data.roomId}`).emit('userStoppedTyping', {
      userId,
      roomId: data.roomId,
    });
  }

  // Helper to get online users
  getOnlineUsers(): string[] {
    return Array.from(this.connectedUsers.keys());
  }
}
