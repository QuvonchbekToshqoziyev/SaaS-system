import { Request, Response } from 'express';
import { ChatMessageKind, ChatType, Prisma, Role } from '@prisma/client';
import { prisma } from '../db';
import { canAccessFirm, getAccessibleFirmIds, isAdmin, isSuperAdmin, normalizeRole } from '../utils/access';
import { writeAuditLog } from '../utils/audit';
import { decryptChatMessageRow, encryptChatJson, encryptChatString } from '../utils/chat-crypto';
import { isFirmAdminLike } from '../utils/firm-user-roles';

type AuthUser = {
  userId?: string;
  role?: string | null;
  firmRole?: string | null;
  firmId?: string | null;
};

const chatTypes = new Set(Object.values(ChatType));
const messageKinds = new Set(Object.values(ChatMessageKind));

function getAuthUser(req: Request): AuthUser {
  return ((req as any).user || {}) as AuthUser;
}

function requireUserId(authUser: AuthUser): string {
  const userId = authUser.userId ? String(authUser.userId) : '';
  if (!userId) throw new Error('User is required');
  return userId;
}

function normalizeChatType(value: unknown): ChatType {
  const raw = String(value || '').trim().toUpperCase();
  if (chatTypes.has(raw as ChatType)) return raw as ChatType;
  return ChatType.PERSONAL;
}

function normalizeMessageKind(value: unknown): ChatMessageKind {
  const raw = String(value || '').trim().toUpperCase();
  if (messageKinds.has(raw as ChatMessageKind)) return raw as ChatMessageKind;
  return ChatMessageKind.TEXT;
}

function cleanString(value: unknown, fallback = ''): string {
  return String(value ?? fallback).trim();
}

function canReadCompanyChannel(authUser: AuthUser): boolean {
  const role = normalizeRole(authUser.role);
  return role === 'SUPERADMIN' || role === 'ADMIN' || isFirmAdminLike(authUser);
}

function canReadSupportTicket(authUser: AuthUser): boolean {
  const role = normalizeRole(authUser.role);
  return role === 'SUPERADMIN' || role === 'ADMIN' || isFirmAdminLike(authUser);
}

function canWriteConversation(authUser: AuthUser, conversation: { type: ChatType; participants?: Array<{ userId: string }> }): boolean {
  const role = normalizeRole(authUser.role);
  const userId = authUser.userId ? String(authUser.userId) : '';
  if (conversation.type === ChatType.COMPANY) return role === 'SUPERADMIN';
  if (conversation.type === ChatType.SUPPORT) return canReadSupportTicket(authUser);
  if (conversation.type === ChatType.AI) return Boolean(userId && conversation.participants?.some((participant) => participant.userId === userId));
  return true;
}

function firmPair(firmAId: string, firmBId: string) {
  const [firmA, firmB] = [firmAId, firmBId].sort();
  return { firmAId: firmA, firmBId: firmB };
}

async function getAllowedPeerFirmIds(firmId: string): Promise<string[]> {
  const rows = await prisma.chatFirmPermission.findMany({
    where: {
      enabled: true,
      OR: [{ firmAId: firmId }, { firmBId: firmId }],
    },
    select: { firmAId: true, firmBId: true },
  });

  return Array.from(new Set(rows.map((row) => row.firmAId === firmId ? row.firmBId : row.firmAId)));
}

async function canFirmsChat(firmAId?: string | null, firmBId?: string | null): Promise<boolean> {
  if (!firmAId || !firmBId) return false;
  if (firmAId === firmBId) return true;
  const pair = firmPair(firmAId, firmBId);
  const permission = await prisma.chatFirmPermission.findUnique({
    where: { firmAId_firmBId: pair },
    select: { enabled: true },
  });
  return Boolean(permission?.enabled);
}

function userSelect() {
  return { id: true, email: true, fullName: true, role: true, firmId: true } as const;
}

async function ensureDefaultConversations(authUser: AuthUser) {
  const userId = requireUserId(authUser);
  const role = normalizeRole(authUser.role);

  const company = await prisma.chatConversation.upsert({
    where: { id: 'company-ado-finance' },
    update: {},
    create: {
      id: 'company-ado-finance',
      type: ChatType.COMPANY,
      title: 'ADO-FINANCE',
      description: 'Official ADO-FINANCE announcements channel',
    },
  });

  if (canReadCompanyChannel(authUser)) {
    await prisma.chatParticipant.upsert({
      where: { conversationId_userId: { conversationId: company.id, userId } },
      update: {},
      create: { conversationId: company.id, userId },
    });
  }

  const aiId = `ai-${userId}`;
  const ai = await prisma.chatConversation.upsert({
    where: { id: aiId },
    update: {},
    create: {
      id: aiId,
      type: ChatType.AI,
      title: 'AI Assistant',
      description: 'Private assistant chat',
    },
  });

  await prisma.chatParticipant.upsert({
    where: { conversationId_userId: { conversationId: ai.id, userId } },
    update: {},
    create: { conversationId: ai.id, userId },
  });

  if (authUser.firmId) {
    const firm = await prisma.firm.findUnique({ where: { id: String(authUser.firmId) }, select: { id: true, name: true } });
    if (firm) {
      const supportId = `support-${firm.id}`;
      const support = await prisma.chatConversation.upsert({
        where: { id: supportId },
        update: { title: `${firm.name} - ADO Support` },
        create: {
          id: supportId,
          type: ChatType.SUPPORT,
          title: `${firm.name} - ADO Support`,
          description: 'Firm support chat with ADO support',
          firmId: firm.id,
        },
      });
      if (canReadSupportTicket(authUser)) {
        await prisma.chatParticipant.upsert({
          where: { conversationId_userId: { conversationId: support.id, userId } },
          update: {},
          create: { conversationId: support.id, userId },
        });
      }

      const branchId = `branch-${firm.id}`;
      const branch = await prisma.chatConversation.upsert({
        where: { id: branchId },
        update: { title: `${firm.name} branch`, branchName: firm.name },
        create: {
          id: branchId,
          type: ChatType.BRANCH,
          title: `${firm.name} branch`,
          branchName: firm.name,
          firmId: firm.id,
        },
      });
      await prisma.chatParticipant.upsert({
        where: { conversationId_userId: { conversationId: branch.id, userId } },
        update: {},
        create: { conversationId: branch.id, userId },
      });
    }
  }

  if (role === 'SUPERADMIN' || role === 'ADMIN') {
    const accounting = await prisma.chatConversation.upsert({
      where: { id: 'department-accounting' },
      update: {},
      create: {
        id: 'department-accounting',
        type: ChatType.DEPARTMENT,
        title: 'Accounting',
        department: 'Accounting',
      },
    });
    await prisma.chatParticipant.upsert({
      where: { conversationId_userId: { conversationId: accounting.id, userId } },
      update: {},
      create: { conversationId: accounting.id, userId },
    });
  }
}

async function conversationAccessWhere(authUser: AuthUser): Promise<Prisma.ChatConversationWhereInput> {
  const userId = requireUserId(authUser);
  const role = normalizeRole(authUser.role);
  const firmIds = await getAccessibleFirmIds(authUser);

  if (role === 'SUPERADMIN') {
    return {
      OR: [
        { participants: { some: { userId } } },
        { type: { in: [ChatType.COMPANY, ChatType.SUPPORT, ChatType.DEPARTMENT] } },
      ],
    };
  }

  if (role === 'ADMIN') {
    return {
      OR: [
        { participants: { some: { userId } } },
        { type: ChatType.COMPANY },
        { type: ChatType.SUPPORT, firmId: firmIds ? { in: firmIds } : undefined },
        { type: ChatType.DEPARTMENT },
      ],
    };
  }

  return {
    OR: [
      { type: { in: [ChatType.PERSONAL, ChatType.BRANCH, ChatType.AI] }, participants: { some: { userId } } },
      ...(canReadCompanyChannel(authUser) ? [{ type: ChatType.COMPANY }] : []),
      ...(canReadSupportTicket(authUser) && authUser.firmId ? [{ type: ChatType.SUPPORT, firmId: String(authUser.firmId) }] : []),
    ],
  };
}

async function assertConversationAccess(authUser: AuthUser, conversationId: string) {
  const role = normalizeRole(authUser.role);
  const where = await conversationAccessWhere(authUser);
  const conversation = await prisma.chatConversation.findFirst({
    where: { AND: [{ id: conversationId }, where] },
    include: { participants: { select: { userId: true, lastReadAt: true, user: { select: { role: true, firmId: true } } } } },
  });
  if (conversation && role === 'FIRM' && conversation.type === ChatType.PERSONAL) {
    const actorFirmId = authUser.firmId ? String(authUser.firmId) : '';
    const firmParticipantIds = conversation.participants
      .map((participant) => participant.user.firmId)
      .filter((firmId): firmId is string => Boolean(firmId));
    for (const firmId of firmParticipantIds) {
      if (!(await canFirmsChat(actorFirmId, firmId))) return null;
    }
  }
  return conversation;
}

async function canListConversation(authUser: AuthUser, row: any): Promise<boolean> {
  const role = normalizeRole(authUser.role);
  if (role !== 'FIRM' || row.type !== ChatType.PERSONAL) return true;
  const actorFirmId = authUser.firmId ? String(authUser.firmId) : '';
  const firmParticipantIds = (row.participants || [])
    .map((participant: any) => participant.user?.firmId)
    .filter((firmId: unknown): firmId is string => Boolean(firmId));
  for (const firmId of firmParticipantIds) {
    if (!(await canFirmsChat(actorFirmId, firmId))) return false;
  }
  return true;
}

function serializeConversation(row: any) {
  const lastMessage = row.messages?.[0] ? decryptChatMessageRow(row.messages[0]) : null;
  const unreadCount = row.messages?.filter((message: any) => {
    const me = row.participants?.find((participant: any) => participant.userId === row.viewerUserId);
    if (!me?.lastReadAt) return message.senderUserId !== row.viewerUserId && !message.deletedAt;
    return message.senderUserId !== row.viewerUserId && new Date(message.createdAt) > new Date(me.lastReadAt) && !message.deletedAt;
  }).length ?? 0;

  return {
    id: row.id,
    type: row.type,
    title: row.title,
    description: row.description,
    department: row.department,
    branchName: row.branchName,
    firmId: row.firmId,
    firm: row.firm,
    participants: row.participants,
    lastMessage,
    unreadCount,
    updatedAt: row.updatedAt,
  };
}

export const listConversations = async (req: Request, res: Response) => {
  const authUser = getAuthUser(req);
  const userId = requireUserId(authUser);
  await ensureDefaultConversations(authUser);
  const where = await conversationAccessWhere(authUser);

  const rows = await prisma.chatConversation.findMany({
    where,
    include: {
      firm: { select: { id: true, name: true } },
      participants: { include: { user: { select: userSelect() } } },
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 30,
        include: { sender: { select: userSelect() } },
      },
    },
    orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
  });

  const visibleRows = [];
  for (const row of rows) {
    if (await canListConversation(authUser, row)) visibleRows.push(row);
  }

  return res.json(visibleRows.map((row) => serializeConversation({ ...row, viewerUserId: userId })));
};

export const createConversation = async (req: Request, res: Response) => {
  const authUser = getAuthUser(req);
  const userId = requireUserId(authUser);
  const type = normalizeChatType(req.body?.type);
  const role = normalizeRole(authUser.role);
  const participantUserIds = Array.isArray(req.body?.participantUserIds)
    ? req.body.participantUserIds.map((id: unknown) => cleanString(id)).filter(Boolean)
    : [];
  const uniqueParticipants = Array.from(new Set([userId, ...participantUserIds]));
  const requestedFirmId = cleanString(req.body?.firmId) || null;
  const firmId = role === 'FIRM' ? (authUser.firmId ? String(authUser.firmId) : null) : requestedFirmId;

  if (type === ChatType.PERSONAL && uniqueParticipants.length !== 2) {
    return res.status(400).json({ error: 'Personal chat requires exactly two people' });
  }
  if (type === ChatType.BRANCH && !firmId) {
    return res.status(400).json({ error: 'Firm is required for this chat type' });
  }
  if (type === ChatType.SUPPORT && !firmId) return res.status(400).json({ error: 'Firm is required for support requests' });
  if (firmId && !(await canAccessFirm(authUser, firmId)) && !isSuperAdmin(authUser)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (type === ChatType.SUPPORT && !canReadSupportTicket(authUser)) {
    return res.status(403).json({ error: 'Only firm admins and ADO support can open support tickets' });
  }
  if (type === ChatType.BRANCH && !isAdmin(authUser)) {
    return res.status(403).json({ error: 'Branch group chats are managed automatically' });
  }
  if (type === ChatType.COMPANY && !isSuperAdmin(authUser)) {
    return res.status(403).json({ error: 'Only superadmin can create announcement channels' });
  }
  if ((type === ChatType.COMPANY || type === ChatType.DEPARTMENT) && !isAdmin(authUser)) {
    return res.status(403).json({ error: 'Only admins can create this chat type' });
  }
  if (type === ChatType.AI) {
    return res.status(400).json({ error: 'AI chat is created automatically' });
  }

  const supportFirstMessage = cleanString(req.body?.message);
  const supportCategory = cleanString(req.body?.category) || 'OTHER';
  const supportPriority = cleanString(req.body?.priority) || 'NORMAL';

  if (type === ChatType.SUPPORT) {
    if (!supportFirstMessage) return res.status(400).json({ error: 'Support request message is required' });
    const firm = await prisma.firm.findUnique({ where: { id: firmId || '' }, select: { id: true, name: true } });
    if (!firm) return res.status(400).json({ error: 'Firm was not found' });
    const conversationId = `support-${firm.id}`;
    const conversation = await prisma.chatConversation.upsert({
      where: { id: conversationId },
      update: {
        title: `${firm.name} - ${cleanString(req.body?.subject) || 'ADO Support'}`,
        description: `OPEN | ${supportPriority} | ${supportCategory}`,
        updatedAt: new Date(),
      },
      create: {
        id: conversationId,
        type,
        title: `${firm.name} - ${cleanString(req.body?.subject) || 'ADO Support'}`,
        description: `OPEN | ${supportPriority} | ${supportCategory}`,
        firmId: firm.id,
      },
      include: {
        firm: { select: { id: true, name: true } },
        participants: { include: { user: { select: userSelect() } } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1, include: { sender: { select: userSelect() } } },
      },
    });
    await prisma.chatParticipant.upsert({
      where: { conversationId_userId: { conversationId: conversation.id, userId } },
      update: {},
      create: { conversationId: conversation.id, userId },
    });
    const message = await prisma.chatMessage.create({
      data: {
        conversationId: conversation.id,
        senderUserId: userId,
        kind: ChatMessageKind.TEXT,
        content: encryptChatString(supportFirstMessage),
        attachment: encryptChatJson({ category: supportCategory, priority: supportPriority }) as Prisma.InputJsonValue,
      },
    });
    await prisma.chatConversation.update({ where: { id: conversation.id }, data: { updatedAt: message.createdAt } });
    return res.status(201).json(serializeConversation({ ...conversation, viewerUserId: userId }));
  }

  const users = await prisma.user.findMany({ where: { id: { in: uniqueParticipants } }, select: { id: true, role: true, firmId: true } });
  if (users.length !== uniqueParticipants.length) return res.status(400).json({ error: 'One or more users were not found' });

  if (!isAdmin(authUser)) {
    const invalid = users.some((user) => user.role !== Role.FIRM);
    if (invalid) return res.status(403).json({ error: 'Forbidden' });
    const actorFirmId = authUser.firmId ? String(authUser.firmId) : '';
    for (const target of users) {
      if (!target.firmId || !(await canFirmsChat(actorFirmId, target.firmId))) {
        return res.status(403).json({ error: 'Firm-to-firm chat is not enabled for one or more selected firms' });
      }
    }
  }

  const title = cleanString(req.body?.title) || (
    type === ChatType.PERSONAL ? 'Personal chat' :
    type === ChatType.BRANCH ? 'Branch chat' :
    type === ChatType.DEPARTMENT ? cleanString(req.body?.department, 'Department') :
    'Company chat'
  );

  const conversation = await prisma.chatConversation.create({
    data: {
      type,
      title,
      description: cleanString(req.body?.description) || null,
      department: type === ChatType.DEPARTMENT ? cleanString(req.body?.department, title) : null,
      branchName: type === ChatType.BRANCH ? cleanString(req.body?.branchName, title) : null,
      firmId,
      participants: {
        create: uniqueParticipants.map((participantId) => ({ userId: participantId })),
      },
    },
    include: {
      firm: { select: { id: true, name: true } },
      participants: { include: { user: { select: userSelect() } } },
      messages: { orderBy: { createdAt: 'desc' }, take: 1, include: { sender: { select: userSelect() } } },
    },
  });

  return res.status(201).json(serializeConversation({ ...conversation, viewerUserId: userId }));
};

export const listChatUsers = async (req: Request, res: Response) => {
  const authUser = getAuthUser(req);
  const role = normalizeRole(authUser.role);
  const firmIds = await getAccessibleFirmIds(authUser);
  const ownFirmId = authUser.firmId ? String(authUser.firmId) : '';
  const allowedPeerFirmIds = role === 'FIRM' && ownFirmId ? await getAllowedPeerFirmIds(ownFirmId) : [];

  const rows = await prisma.user.findMany({
    where: role === 'SUPERADMIN'
      ? {}
      : role === 'ADMIN'
        ? { OR: [{ role: { in: [Role.ADMIN, Role.SUPERADMIN] } }, { firmId: firmIds ? { in: firmIds } : undefined }] }
        : { firmId: { in: [ownFirmId, ...allowedPeerFirmIds].filter(Boolean) } },
    select: userSelect(),
    orderBy: [{ role: 'asc' }, { email: 'asc' }],
  });

  return res.json(rows);
};

export const getFirmChatSettings = async (req: Request, res: Response) => {
  const authUser = getAuthUser(req);
  if (!isSuperAdmin(authUser)) return res.status(403).json({ error: 'Only superadmin can manage chat settings' });

  const [firms, permissions] = await Promise.all([
    prisma.firm.findMany({
      select: { id: true, name: true, status: true },
      orderBy: { name: 'asc' },
    }),
    prisma.chatFirmPermission.findMany({
      orderBy: [{ updatedAt: 'desc' }],
    }),
  ]);

  return res.json({ firms, permissions });
};

export const setFirmChatPermission = async (req: Request, res: Response) => {
  const authUser = getAuthUser(req);
  const actorUserId = requireUserId(authUser);
  if (!isSuperAdmin(authUser)) return res.status(403).json({ error: 'Only superadmin can manage chat settings' });

  const firmA = cleanString(req.body?.firmAId);
  const firmB = cleanString(req.body?.firmBId);
  const enabled = req.body?.enabled !== false;
  if (!firmA || !firmB) return res.status(400).json({ error: 'Both firms are required' });
  if (firmA === firmB) return res.status(400).json({ error: 'Select two different firms' });

  const firms = await prisma.firm.findMany({
    where: { id: { in: [firmA, firmB] } },
    select: { id: true, name: true },
  });
  if (firms.length !== 2) return res.status(400).json({ error: 'One or more firms were not found' });

  const pair = firmPair(firmA, firmB);
  const permission = await prisma.chatFirmPermission.upsert({
    where: { firmAId_firmBId: pair },
    update: { enabled, updatedByUserId: actorUserId },
    create: { ...pair, enabled, createdByUserId: actorUserId, updatedByUserId: actorUserId },
  });

  await writeAuditLog(req, {
    action: enabled ? 'ENABLE' : 'DISABLE',
    entityType: 'chatFirmPermission',
    entityId: permission.id,
    entityLabel: `${firms[0]?.name || pair.firmAId} ↔ ${firms[1]?.name || pair.firmBId}`,
    summary: `${enabled ? 'Enabled' : 'Disabled'} firm-to-firm chat`,
    after: permission,
  });

  return res.json(permission);
};

export const listMessages = async (req: Request, res: Response) => {
  const authUser = getAuthUser(req);
  const userId = requireUserId(authUser);
  const conversationId = String(req.params.conversationId || '');
  const conversation = await assertConversationAccess(authUser, conversationId);
  if (!conversation) return res.status(404).json({ error: 'Conversation not found' });

  await prisma.chatParticipant.upsert({
    where: { conversationId_userId: { conversationId, userId } },
    update: { lastReadAt: new Date() },
    create: { conversationId, userId, lastReadAt: new Date() },
  });

  const rows = await prisma.chatMessage.findMany({
    where: { conversationId },
    include: {
      sender: { select: userSelect() },
      replyToMessage: { include: { sender: { select: userSelect() } } },
      forwardedFrom: { include: { sender: { select: userSelect() } } },
    },
    orderBy: { createdAt: 'asc' },
    take: 200,
  });

  return res.json(rows.map((row) => decryptChatMessageRow(row)));
};

export const sendMessage = async (req: Request, res: Response) => {
  const authUser = getAuthUser(req);
  const userId = requireUserId(authUser);
  const conversationId = String(req.params.conversationId || '');
  const conversation = await assertConversationAccess(authUser, conversationId);
  if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
  if (!canWriteConversation(authUser, conversation)) {
    return res.status(403).json({ error: 'You do not have permission to write in this chat' });
  }

  const content = cleanString(req.body?.content);
  const kind = normalizeMessageKind(req.body?.kind);
  const mentions = Array.isArray(req.body?.mentions)
    ? req.body.mentions.map((item: unknown) => cleanString(item)).filter(Boolean).slice(0, 20)
    : [];
  const attachment = req.body?.attachment && typeof req.body.attachment === 'object' ? req.body.attachment : undefined;

  if (!content && !attachment) return res.status(400).json({ error: 'Message text or attachment is required' });

  const message = await prisma.chatMessage.create({
    data: {
      conversationId,
      senderUserId: userId,
      kind,
      content: encryptChatString(content || null),
      attachment: encryptChatJson(attachment) as Prisma.InputJsonValue | undefined,
      mentions,
      replyToMessageId: cleanString(req.body?.replyToMessageId) || null,
      forwardedFromId: cleanString(req.body?.forwardedFromId) || null,
    },
    include: { sender: { select: userSelect() } },
  });

  await prisma.chatConversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
  await prisma.chatParticipant.upsert({
    where: { conversationId_userId: { conversationId, userId } },
    update: { lastReadAt: new Date() },
    create: { conversationId, userId, lastReadAt: new Date() },
  });

  if (conversation.type === ChatType.AI) {
    await prisma.chatMessage.create({
      data: {
        conversationId,
        senderUserId: null,
        kind: ChatMessageKind.TEXT,
        content: encryptChatString('AI Assistant: I received your message. Live AI integration can be connected here for accounting, tickets, reports, and support questions.'),
      },
    });
    await prisma.chatConversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
  }

  return res.status(201).json(decryptChatMessageRow(message));
};

export const editMessage = async (req: Request, res: Response) => {
  const authUser = getAuthUser(req);
  const userId = requireUserId(authUser);
  const messageId = String(req.params.messageId || '');
  const content = cleanString(req.body?.content);
  if (!content) return res.status(400).json({ error: 'Message text is required' });

  const existing = await prisma.chatMessage.findUnique({ where: { id: messageId }, include: { conversation: true } });
  if (!existing || existing.deletedAt) return res.status(404).json({ error: 'Message not found' });
  if (existing.senderUserId !== userId) return res.status(403).json({ error: 'Only the sender can edit this message' });
  if (!(await assertConversationAccess(authUser, existing.conversationId))) return res.status(403).json({ error: 'Forbidden' });

  const updated = await prisma.chatMessage.update({
    where: { id: messageId },
    data: { content: encryptChatString(content), editedAt: new Date() },
    include: { sender: { select: userSelect() } },
  });

  return res.json(decryptChatMessageRow(updated));
};

export const deleteMessage = async (req: Request, res: Response) => {
  const authUser = getAuthUser(req);
  const userId = requireUserId(authUser);
  const messageId = String(req.params.messageId || '');
  const existing = await prisma.chatMessage.findUnique({ where: { id: messageId }, include: { conversation: true } });
  if (!existing) return res.status(404).json({ error: 'Message not found' });
  if (existing.senderUserId !== userId && !isAdmin(authUser)) return res.status(403).json({ error: 'Forbidden' });
  if (!(await assertConversationAccess(authUser, existing.conversationId))) return res.status(403).json({ error: 'Forbidden' });

  await prisma.chatMessage.update({
    where: { id: messageId },
    data: { deletedAt: new Date(), content: null, attachment: Prisma.JsonNull, mentions: [] },
  });

  return res.json({ ok: true });
};

export const markConversationRead = async (req: Request, res: Response) => {
  const authUser = getAuthUser(req);
  const userId = requireUserId(authUser);
  const conversationId = String(req.params.conversationId || '');
  if (!(await assertConversationAccess(authUser, conversationId))) return res.status(404).json({ error: 'Conversation not found' });

  await prisma.chatParticipant.upsert({
    where: { conversationId_userId: { conversationId, userId } },
    update: { lastReadAt: new Date() },
    create: { conversationId, userId, lastReadAt: new Date() },
  });

  return res.json({ ok: true });
};
