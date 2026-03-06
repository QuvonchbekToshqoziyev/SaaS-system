import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  ManyToMany,
  JoinTable,
} from 'typeorm';
import { ChatMessage } from './chat-message.entity';
import { User } from './user.entity';

export enum ChatRoomType {
  DIRECT = 'direct', // 1:1 between accountant and client
  GROUP = 'group', // Group chat for a company
  SUPPORT = 'support', // Support channel
}

@Entity('chat_rooms')
export class ChatRoom {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  name: string;

  @Column({ type: 'enum', enum: ChatRoomType, default: ChatRoomType.DIRECT })
  type: ChatRoomType;

  @Column({ nullable: true })
  companyId: string; // Which company this room relates to

  @Column({ default: true })
  isActive: boolean;

  @ManyToMany(() => User)
  @JoinTable({
    name: 'chat_room_participants',
    joinColumn: { name: 'roomId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'userId', referencedColumnName: 'id' },
  })
  participants: User[];

  @OneToMany(() => ChatMessage, (msg) => msg.room)
  messages: ChatMessage[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
