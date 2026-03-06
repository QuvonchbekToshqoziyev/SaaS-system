import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';
import { ChatRoom } from './chat-room.entity';

export enum MessageType {
  TEXT = 'text',
  FILE = 'file',
  SYSTEM = 'system',
}

@Entity('chat_messages')
export class ChatMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'enum', enum: MessageType, default: MessageType.TEXT })
  type: MessageType;

  @Column({ nullable: true })
  fileUrl: string;

  @Column({ nullable: true })
  fileName: string;

  @Column({ default: false })
  isRead: boolean;

  @ManyToOne(() => ChatRoom, (room) => room.messages)
  @JoinColumn({ name: 'roomId' })
  room: ChatRoom;

  @Column()
  roomId: string;

  @ManyToOne(() => User, (user) => user.sentMessages)
  @JoinColumn({ name: 'senderId' })
  sender: User;

  @Column()
  senderId: string;

  @CreateDateColumn()
  createdAt: Date;
}
