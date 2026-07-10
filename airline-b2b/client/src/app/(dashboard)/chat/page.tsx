"use client";

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import type { AxiosError } from 'axios';
import {
  AtSign,
  ArrowLeft,
  Bot,
  Building2,
  CheckCheck,
  Edit3,
  File,
  FileSpreadsheet,
  Forward,
  Image,
  LifeBuoy,
  Megaphone,
  MessageCircle,
  Mic,
  Paperclip,
  Reply,
  Search,
  Send,
  Settings,
  Sparkles,
  Smile,
  Trash2,
  Users,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';

type ChatType = 'PERSONAL' | 'DEPARTMENT' | 'BRANCH' | 'COMPANY' | 'SUPPORT' | 'AI';
type MessageKind = 'TEXT' | 'EMOJI' | 'FILE' | 'IMAGE' | 'PDF' | 'EXCEL' | 'VOICE';
type ApiErrorResponse = { error?: string };

type ChatUser = {
  id: string;
  email: string;
  fullName?: string | null;
  role: string;
  firmId?: string | null;
};

type ChatParticipant = {
  id: string;
  userId: string;
  lastReadAt?: string | null;
  user?: ChatUser;
};

type ChatMessage = {
  id: string;
  conversationId: string;
  senderUserId?: string | null;
  sender?: ChatUser | null;
  kind: MessageKind;
  content?: string | null;
  attachment?: { name?: string; mime?: string } | null;
  mentions?: string[];
  replyToMessageId?: string | null;
  replyToMessage?: ChatMessage | null;
  forwardedFromId?: string | null;
  forwardedFrom?: ChatMessage | null;
  editedAt?: string | null;
  deletedAt?: string | null;
  createdAt: string;
};

type Conversation = {
  id: string;
  type: ChatType;
  title: string;
  description?: string | null;
  department?: string | null;
  branchName?: string | null;
  firmId?: string | null;
  firm?: { id: string; name: string } | null;
  participants: ChatParticipant[];
  lastMessage?: ChatMessage | null;
  unreadCount: number;
  updatedAt: string;
};

type FirmOption = { id: string; name: string; status?: string };
type ChatFirmPermission = {
  id: string;
  firmAId: string;
  firmBId: string;
  enabled: boolean;
  updatedAt: string;
};

function apiErrorMessage(err: unknown): string | undefined {
  return (err as AxiosError<ApiErrorResponse>)?.response?.data?.error;
}

function formatTime(value?: string | null): string {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function typeIcon(type: ChatType) {
  if (type === 'AI') return Bot;
  if (type === 'COMPANY') return Megaphone;
  if (type === 'SUPPORT') return LifeBuoy;
  if (type === 'DEPARTMENT' || type === 'BRANCH') return Users;
  return MessageCircle;
}

function typeLabel(type: ChatType): string {
  if (type === 'BRANCH') return 'BRANCH GROUP';
  if (type === 'SUPPORT') return 'SUPPORT TICKET';
  if (type === 'COMPANY') return 'ADO-FINANCE CHANNEL';
  if (type === 'AI') return 'AI ASSISTANT';
  if (type === 'DEPARTMENT') return 'DEPARTMENT';
  return 'DIRECT';
}

function conversationSubtitle(conversation: Conversation): string {
  if (conversation.type === 'SUPPORT') return conversation.description || 'OPEN | NORMAL | OTHER';
  if (conversation.type === 'COMPANY') return 'Official announcements · read only';
  if (conversation.type === 'AI') return 'Private · role-aware assistant';
  if (conversation.type === 'BRANCH') return `${conversation.branchName || conversation.firm?.name || 'Branch'} · internal group`;
  return conversation.description || typeLabel(conversation.type);
}

const kindButtons: Array<{ kind: MessageKind; label: string; icon: typeof Paperclip }> = [
  { kind: 'EMOJI', label: 'Emoji', icon: Smile },
  { kind: 'FILE', label: 'File', icon: Paperclip },
  { kind: 'IMAGE', label: 'Image', icon: Image },
  { kind: 'PDF', label: 'PDF', icon: File },
  { kind: 'EXCEL', label: 'Excel', icon: FileSpreadsheet },
  { kind: 'VOICE', label: 'Voice', icon: Mic },
];

export default function ChatPage() {
  const { user } = useAuth();
  const { tr } = useLanguage();
  const queryClient = useQueryClient();
  const role = String(user?.role || '').toUpperCase();
  const isSuperAdmin = role === 'SUPERADMIN';
  const firmRole = String(user?.firmRole || 'FIRM_ADMIN').toUpperCase();
  const isFirmAdminLike = role === 'SUPERADMIN' || role === 'ADMIN' || firmRole === 'FIRM_ADMIN';
  const [section, setSection] = useState<'messages' | 'settings'>('messages');
  const [supportFilter, setSupportFilter] = useState<'all' | 'inbox' | 'outbox'>('all');
  const [selectedId, setSelectedId] = useState<string>('');
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');
  const [kind, setKind] = useState<MessageKind>('TEXT');
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [newType, setNewType] = useState<ChatType>('PERSONAL');
  const [newTitle, setNewTitle] = useState('');
  const [newUserId, setNewUserId] = useState('');
  const [supportSubject, setSupportSubject] = useState('');
  const [supportCategory, setSupportCategory] = useState('TECHNICAL');
  const [supportPriority, setSupportPriority] = useState('NORMAL');
  const [supportMessage, setSupportMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [firmAId, setFirmAId] = useState('');
  const [firmBId, setFirmBId] = useState('');
  const [savingPermission, setSavingPermission] = useState(false);

  const { data: conversations = [], isLoading: conversationsLoading } = useQuery<Conversation[]>({
    queryKey: ['chat-conversations'],
    queryFn: async () => (await api.get('/chat/conversations')).data,
  });

  const selectedConversation = useMemo(() => {
    return conversations.find((item) => item.id === selectedId) || conversations[0] || null;
  }, [conversations, selectedId]);

  const activeId = selectedConversation?.id || '';

  const { data: messages = [], isLoading: messagesLoading } = useQuery<ChatMessage[]>({
    queryKey: ['chat-messages', activeId],
    queryFn: async () => (await api.get(`/chat/conversations/${activeId}/messages`)).data,
    enabled: Boolean(activeId),
  });

  const { data: chatUsers = [] } = useQuery<ChatUser[]>({
    queryKey: ['chat-users'],
    queryFn: async () => (await api.get('/chat/users')).data,
  });

  const { data: firmSettings } = useQuery<{ firms: FirmOption[]; permissions: ChatFirmPermission[] }>({
    queryKey: ['chat-firm-settings'],
    queryFn: async () => (await api.get('/chat/firm-settings')).data,
    enabled: isSuperAdmin,
  });

  const filteredConversations = useMemo(() => {
    const needle = search.trim().toLowerCase();
    let rows = conversations;
    if (isSuperAdmin && supportFilter !== 'all') {
      rows = rows.filter((item) => {
        const senderRole = String(item.lastMessage?.sender?.role || '').toUpperCase();
        const fromMe = item.lastMessage?.senderUserId === user?.id;
        if (supportFilter === 'inbox') return item.type === 'SUPPORT' && !fromMe && senderRole === 'FIRM';
        return item.type === 'SUPPORT' && fromMe;
      });
    }
    if (!needle) return rows;
    return rows.filter((item) => {
      const last = item.lastMessage?.content || item.lastMessage?.attachment?.name || '';
      return `${item.title} ${item.type} ${last}`.toLowerCase().includes(needle);
    });
  }, [conversations, search, supportFilter, isSuperAdmin, user?.id]);

  const visibleMessages = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return messages;
    return messages.filter((item) => `${item.content || ''} ${item.sender?.email || ''} ${item.attachment?.name || ''}`.toLowerCase().includes(needle));
  }, [messages, search]);

  const groupedConversations = useMemo(() => {
    const groups: Array<{ key: string; title: string; types: ChatType[]; rows: Conversation[] }> = [
      { key: 'branch', title: tr('Branch Groups', 'Filial guruhlari'), types: ['BRANCH'], rows: [] },
      { key: 'support', title: tr('ADO Support', 'ADO Support'), types: ['SUPPORT'], rows: [] },
      { key: 'announcements', title: tr('Announcements', 'E\'lonlar'), types: ['COMPANY'], rows: [] },
      { key: 'ai', title: tr('AI Assistant', 'AI yordamchi'), types: ['AI'], rows: [] },
      { key: 'direct', title: tr('Direct and Departments', 'Direct va bo\'limlar'), types: ['PERSONAL', 'DEPARTMENT'], rows: [] },
    ];
    for (const conversation of filteredConversations) {
      const group = groups.find((item) => item.types.includes(conversation.type)) || groups[groups.length - 1];
      group.rows.push(conversation);
    }
    return groups.filter((item) => item.rows.length > 0);
  }, [filteredConversations, tr]);

  const activeParticipants = selectedConversation?.participants || [];
  const selectedType = selectedConversation?.type;
  const canWriteSelected = Boolean(selectedConversation) && !(selectedType === 'COMPANY' && role !== 'SUPERADMIN');
  const SelectedHeaderIcon = selectedConversation ? typeIcon(selectedConversation.type) : MessageCircle;
  const readCount = (messageRow: ChatMessage) => activeParticipants.filter((participant) => {
    if (participant.userId === messageRow.senderUserId) return true;
    return participant.lastReadAt && new Date(participant.lastReadAt) >= new Date(messageRow.createdAt);
  }).length;

  const setConversation = (id: string) => {
    setSelectedId(id);
    setReplyTo(null);
    setEditing(null);
    if (id) api.post(`/chat/conversations/${id}/read`).catch(() => undefined);
  };

  const resetComposer = () => {
    setMessage('');
    setKind('TEXT');
    setReplyTo(null);
    setEditing(null);
    setIsTyping(false);
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeId) return;
    if (!canWriteSelected) {
      toast.error(tr('This chat is read only', 'Bu chat faqat o\'qish uchun'));
      return;
    }
    const text = message.trim();
    if (!text) {
      toast.error(tr('Write a message first', 'Avval xabar yozing'));
      return;
    }

    const mentions = Array.from(text.matchAll(/@([\w.-]+)/g)).map((match) => match[1]);
    try {
      if (editing) {
        await api.patch(`/chat/messages/${editing.id}`, { content: text });
        toast.success(tr('Message edited', 'Xabar tahrirlandi'));
      } else {
        await api.post(`/chat/conversations/${activeId}/messages`, {
          content: text,
          kind,
          mentions,
          replyToMessageId: replyTo?.id,
          attachment: kind === 'TEXT' || kind === 'EMOJI' ? undefined : { name: text, mime: kind.toLowerCase() },
        });
      }
      resetComposer();
      queryClient.invalidateQueries({ queryKey: ['chat-conversations'] });
      queryClient.invalidateQueries({ queryKey: ['chat-messages', activeId] });
    } catch (err: unknown) {
      toast.error(apiErrorMessage(err) || tr('Failed to send message', 'Xabar yuborilmadi'));
    }
  };

  const deleteMessage = async (messageId: string) => {
    try {
      await api.delete(`/chat/messages/${messageId}`);
      toast.success(tr('Message deleted', 'Xabar o\'chirildi'));
      queryClient.invalidateQueries({ queryKey: ['chat-conversations'] });
      queryClient.invalidateQueries({ queryKey: ['chat-messages', activeId] });
    } catch (err: unknown) {
      toast.error(apiErrorMessage(err) || tr('Failed to delete message', 'Xabar o\'chirilmadi'));
    }
  };

  const forwardMessage = async (row: ChatMessage) => {
    if (!activeId) return;
    if (!canWriteSelected) {
      toast.error(tr('This chat is read only', 'Bu chat faqat o\'qish uchun'));
      return;
    }
    try {
      await api.post(`/chat/conversations/${activeId}/messages`, {
        content: row.content || row.attachment?.name || tr('Forwarded attachment', 'Forward qilingan fayl'),
        kind: row.kind,
        forwardedFromId: row.id,
        attachment: row.attachment || undefined,
      });
      toast.success(tr('Message forwarded', 'Xabar forward qilindi'));
      queryClient.invalidateQueries({ queryKey: ['chat-messages', activeId] });
      queryClient.invalidateQueries({ queryKey: ['chat-conversations'] });
    } catch (err: unknown) {
      toast.error(apiErrorMessage(err) || tr('Failed to forward message', 'Forward qilib bo\'lmadi'));
    }
  };

  const createConversation = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = newTitle.trim();
    const participantUserIds = newType === 'PERSONAL' && newUserId ? [newUserId] : [];
    if (newType === 'PERSONAL' && !newUserId) {
      toast.error(tr('Select a person', 'Odamni tanlang'));
      return;
    }
    if (newType === 'SUPPORT' && (!supportSubject.trim() || !supportMessage.trim())) {
      toast.error(tr('Add support subject and message', 'Support mavzusi va xabarini kiriting'));
      return;
    }
    try {
      const response = await api.post('/chat/conversations', {
        type: newType,
        title: title || undefined,
        subject: supportSubject.trim() || undefined,
        category: newType === 'SUPPORT' ? supportCategory : undefined,
        priority: newType === 'SUPPORT' ? supportPriority : undefined,
        message: supportMessage.trim() || undefined,
        department: newType === 'DEPARTMENT' ? title || 'Accounting' : undefined,
        participantUserIds,
      });
      setSelectedId(response.data.id);
      setNewTitle('');
      setNewUserId('');
      setSupportSubject('');
      setSupportMessage('');
      queryClient.invalidateQueries({ queryKey: ['chat-conversations'] });
      toast.success(tr('Chat created', 'Chat yaratildi'));
    } catch (err: unknown) {
      toast.error(apiErrorMessage(err) || tr('Failed to create chat', 'Chat yaratilmadi'));
    }
  };

  const saveFirmPermission = async (enabled: boolean, permission?: ChatFirmPermission) => {
    const firstFirmId = permission?.firmAId || firmAId;
    const secondFirmId = permission?.firmBId || firmBId;
    if (!firstFirmId || !secondFirmId || firstFirmId === secondFirmId) {
      toast.error(tr('Select two different firms', 'Ikki xil firmani tanlang'));
      return;
    }

    try {
      setSavingPermission(true);
      await api.put('/chat/firm-settings', { firmAId: firstFirmId, firmBId: secondFirmId, enabled });
      toast.success(enabled ? tr('Firm chat opened', 'Firmalar chati ochildi') : tr('Firm chat closed', 'Firmalar chati yopildi'));
      setFirmAId('');
      setFirmBId('');
      queryClient.invalidateQueries({ queryKey: ['chat-firm-settings'] });
      queryClient.invalidateQueries({ queryKey: ['chat-users'] });
    } catch (err: unknown) {
      toast.error(apiErrorMessage(err) || tr('Failed to save chat setting', 'Chat sozlamasi saqlanmadi'));
    } finally {
      setSavingPermission(false);
    }
  };

  const canCreateSelectedType = newType === 'PERSONAL' || (newType === 'DEPARTMENT' && role !== 'FIRM') || (newType === 'SUPPORT' && isFirmAdminLike);
  const firms = firmSettings?.firms || [];
  const permissions = firmSettings?.permissions || [];
  const firmName = (id: string) => firms.find((firm) => firm.id === id)?.name || id;

  return (
    <div className="h-[calc(100dvh-9.5rem)] min-h-[520px] md:h-full md:min-h-[720px] grid grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)] gap-4">
      <aside className={`glass-panel overflow-hidden flex-col min-h-0 ${selectedId ? 'hidden xl:flex' : 'flex'}`}>
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-bold text-foreground">{tr('Messenger', 'Messenger')}</h2>
              <p className="text-sm text-muted">{tr('Personal, team, company, support, and AI chats.', 'Personal, jamoa, kompaniya, support va AI chatlar.')}</p>
            </div>
            <MessageCircle className="text-primary shrink-0" size={24} />
          </div>
          {isSuperAdmin && (
            <div className="mt-4 grid grid-cols-2 rounded-md border border-border bg-surface-2 p-1">
              <button
                type="button"
                onClick={() => setSection('messages')}
                className={`rounded px-3 py-2 text-sm font-semibold ${section === 'messages' ? 'bg-primary text-primary-foreground' : 'text-muted hover:text-foreground'}`}
              >
                {tr('Messages', 'Xabarlar')}
              </button>
              <button
                type="button"
                onClick={() => setSection('settings')}
                className={`inline-flex items-center justify-center gap-2 rounded px-3 py-2 text-sm font-semibold ${section === 'settings' ? 'bg-primary text-primary-foreground' : 'text-muted hover:text-foreground'}`}
              >
                <Settings size={15} />
                {tr('Settings', 'Sozlamalar')}
              </button>
            </div>
          )}
          <label className="mt-4 flex items-center gap-2 rounded-md border border-border bg-surface-2 px-3 py-2">
            <Search size={16} className="text-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tr('Search chats', 'Chat qidirish')}
              className="w-full bg-transparent text-sm outline-none text-foreground placeholder:text-muted"
            />
          </label>
          {isSuperAdmin && section === 'messages' && (
            <div className="mt-3 flex gap-2">
              {[
                { key: 'all', label: tr('All', 'Hammasi') },
                { key: 'inbox', label: tr('To ADO-Superadmin', 'ADO-Superadminga') },
                { key: 'outbox', label: tr('To customer admins', 'Customer adminlarga') },
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setSupportFilter(item.key as 'all' | 'inbox' | 'outbox')}
                  className={`rounded border px-2.5 py-1.5 text-xs font-semibold ${supportFilter === item.key ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted hover:text-foreground'}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {section === 'messages' && (
        <div className="p-3 border-b border-border">
          <form onSubmit={createConversation} className="grid grid-cols-1 gap-2">
            <select value={newType} onChange={(e) => setNewType(e.target.value as ChatType)} className="compact-control">
              <option value="PERSONAL">{tr('Direct chat', 'Direct chat')}</option>
              {role !== 'FIRM' && <option value="DEPARTMENT">{tr('Department chat', 'Department chat')}</option>}
              {isFirmAdminLike && <option value="SUPPORT">{tr('Support request', 'Support so\'rovi')}</option>}
              <option value="BRANCH" disabled>{tr('Branch group is automatic', 'Filial guruhi avtomatik')}</option>
              <option value="COMPANY" disabled>{tr('Announcements are managed by superadmin', 'E\'lonlarni superadmin boshqaradi')}</option>
              <option value="AI" disabled>{tr('AI assistant is automatic', 'AI yordamchi avtomatik')}</option>
            </select>
            {newType === 'PERSONAL' && (
              <select value={newUserId} onChange={(e) => setNewUserId(e.target.value)} className="compact-control">
                <option value="">{tr('Select user', 'User tanlang')}</option>
                {chatUsers.filter((row) => row.id !== user?.id).map((row) => (
                  <option key={row.id} value={row.id}>{row.fullName || row.email}</option>
                ))}
              </select>
            )}
            {newType === 'SUPPORT' && (
              <div className="grid grid-cols-1 gap-2">
                <input
                  value={supportSubject}
                  onChange={(e) => setSupportSubject(e.target.value)}
                  placeholder={tr('Support subject', 'Support mavzusi')}
                  className="compact-control"
                />
                <div className="grid grid-cols-2 gap-2">
                  <select value={supportCategory} onChange={(e) => setSupportCategory(e.target.value)} className="compact-control">
                    {['TECHNICAL', 'ACCOUNTING', 'PAYMENT', 'ACCESS', 'BUG', 'FEATURE_REQUEST', 'OTHER'].map((item) => (
                      <option key={item} value={item}>{item.replace('_', ' ')}</option>
                    ))}
                  </select>
                  <select value={supportPriority} onChange={(e) => setSupportPriority(e.target.value)} className="compact-control">
                    {['LOW', 'NORMAL', 'HIGH', 'URGENT'].map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </div>
                <textarea
                  value={supportMessage}
                  onChange={(e) => setSupportMessage(e.target.value)}
                  rows={3}
                  placeholder={tr('What should ADO support check?', 'ADO support nimani tekshirsin?')}
                  className="compact-control min-h-[74px] resize-none"
                />
              </div>
            )}
            <div className="flex gap-2">
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder={newType === 'DEPARTMENT' ? tr('Department name', 'Department nomi') : tr('Chat title', 'Chat nomi')}
                className="compact-control min-w-0"
                disabled={!canCreateSelectedType || newType === 'SUPPORT'}
              />
              <button type="submit" disabled={!canCreateSelectedType} className="px-3 rounded-md bg-primary text-primary-foreground disabled:opacity-40">
                <Send size={16} />
              </button>
            </div>
          </form>
        </div>
        )}

        {section === 'messages' ? (
        <div className="flex-1 overflow-y-auto scroller-minimal">
          {conversationsLoading && <p className="p-4 text-sm text-muted">{tr('Loading chats...', 'Chatlar yuklanmoqda...')}</p>}
          {groupedConversations.map((group) => (
            <div key={group.key} className="border-b border-border/70">
              <div className="sticky top-0 z-10 bg-surface/95 px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-muted">
                {group.title}
              </div>
              {group.rows.map((conversation) => {
                const Icon = typeIcon(conversation.type);
                const isActive = conversation.id === activeId;
                return (
                  <button
                    key={conversation.id}
                    type="button"
                    onClick={() => setConversation(conversation.id)}
                    className={`w-full text-left p-4 border-t border-border flex gap-3 ${isActive ? 'bg-surface-2' : 'hover:bg-surface-2/70'}`}
                  >
                    <div className="w-11 h-11 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                      <Icon size={20} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-foreground truncate">{conversation.title}</p>
                        {conversation.unreadCount > 0 && (
                          <span className="ml-auto rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-foreground">{conversation.unreadCount}</span>
                        )}
                      </div>
                      <p className="mt-0.5 text-[11px] uppercase tracking-wide text-muted">{typeLabel(conversation.type)}</p>
                      <p className="mt-1 text-sm text-muted truncate">
                        {conversation.lastMessage?.deletedAt
                          ? tr('Deleted message', 'O\'chirilgan xabar')
                          : conversation.lastMessage?.content || conversation.lastMessage?.attachment?.name || conversationSubtitle(conversation) || tr('No messages yet', 'Hali xabar yo\'q')}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          ))}
          {!conversationsLoading && groupedConversations.length === 0 && (
            <p className="p-4 text-sm text-muted">{tr('No chats match your search.', 'Qidiruvga mos chat yo\'q.')}</p>
          )}
        </div>
        ) : (
          <div className="flex-1 overflow-y-auto scroller-minimal p-3 space-y-3">
            <div className="rounded-md border border-border bg-surface p-3">
              <h3 className="font-semibold text-foreground">{tr('Firm-to-firm chat access', 'Firmalararo chat access')}</h3>
              <p className="mt-1 text-sm text-muted">{tr('Open or close direct chats between customer firms.', 'Customer firmalar orasida to\'g\'ridan-to\'g\'ri chatni oching yoki yoping.')}</p>
              <div className="mt-3 grid grid-cols-1 gap-2">
                <select value={firmAId} onChange={(e) => setFirmAId(e.target.value)} className="compact-control">
                  <option value="">{tr('First firm', 'Birinchi firma')}</option>
                  {firms.map((firm) => <option key={firm.id} value={firm.id}>{firm.name}</option>)}
                </select>
                <select value={firmBId} onChange={(e) => setFirmBId(e.target.value)} className="compact-control">
                  <option value="">{tr('Second firm', 'Ikkinchi firma')}</option>
                  {firms.filter((firm) => firm.id !== firmAId).map((firm) => <option key={firm.id} value={firm.id}>{firm.name}</option>)}
                </select>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" disabled={savingPermission} onClick={() => saveFirmPermission(true)} className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
                    {tr('Open chat', 'Chat ochish')}
                  </button>
                  <button type="button" disabled={savingPermission} onClick={() => saveFirmPermission(false)} className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-600 disabled:opacity-50">
                    {tr('Close chat', 'Chat yopish')}
                  </button>
                </div>
              </div>
            </div>
            {permissions.length === 0 ? (
              <p className="rounded-md border border-border p-3 text-sm text-muted">{tr('No firm chat rules yet.', 'Hali firmalararo chat qoidalari yo\'q.')}</p>
            ) : permissions.map((permission) => (
              <div key={permission.id} className="rounded-md border border-border bg-surface p-3">
                <div className="font-semibold text-foreground">{firmName(permission.firmAId)} ↔ {firmName(permission.firmBId)}</div>
                <div className="mt-1 text-xs uppercase tracking-wide text-muted">{permission.enabled ? tr('Open', 'Ochiq') : tr('Closed', 'Yopiq')}</div>
                <button
                  type="button"
                  disabled={savingPermission}
                  onClick={() => saveFirmPermission(!permission.enabled, permission)}
                  className="mt-3 rounded-md border border-border px-3 py-2 text-sm font-semibold text-foreground hover:bg-surface-2 disabled:opacity-50"
                >
                  {permission.enabled ? tr('Close', 'Yopish') : tr('Open', 'Ochish')}
                </button>
              </div>
            ))}
          </div>
        )}
      </aside>

      <section className={`glass-panel overflow-hidden flex-col min-h-0 ${selectedId ? 'flex' : 'hidden xl:flex'}`}>
        {section === 'settings' ? (
          <div className="h-full flex items-center justify-center p-8 text-center">
            <div>
              <Settings size={40} className="mx-auto text-muted" />
              <h3 className="mt-3 text-xl font-bold text-foreground">{tr('Chat settings', 'Chat sozlamalari')}</h3>
              <p className="mt-1 text-sm text-muted">{tr('Choose which customer firms can chat with each other from the left panel.', 'Chap paneldan qaysi customer firmalar bir-biri bilan chat qila olishini tanlang.')}</p>
            </div>
          </div>
        ) : selectedConversation ? (
          <>
            <header className="p-3 md:p-4 border-b border-border flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  type="button"
                  onClick={() => setSelectedId('')}
                  className="grid h-10 w-10 place-items-center rounded-md border border-border bg-surface-2 xl:hidden"
                  aria-label={tr('Back to chats', 'Chatlarga qaytish')}
                >
                  <ArrowLeft size={18} />
                </button>
                <div className="w-12 h-12 rounded-md bg-surface-2 border border-border flex items-center justify-center text-primary font-bold">
                  <SelectedHeaderIcon size={22} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-xl font-bold text-foreground truncate">{selectedConversation.title}</h3>
                  <p className="text-sm text-muted truncate">
                    {selectedConversation.type === 'SUPPORT'
                      ? conversationSubtitle(selectedConversation)
                      : selectedConversation.type === 'AI'
                        ? tr('Private · role-aware assistant', 'Private · rolingizga mos yordamchi')
                        : selectedConversation.type === 'COMPANY'
                          ? tr('Official announcements · read only', 'Rasmiy e\'lonlar · faqat o\'qish')
                          : `${selectedConversation.participants.length} ${tr('members', 'a\'zo')} · ${isTyping ? tr('Typing...', 'Yozmoqda...') : typeLabel(selectedConversation.type)}`}
                  </p>
                </div>
              </div>
              <div className="hidden md:flex items-center gap-2 text-xs text-muted">
                {selectedConversation.type === 'AI' ? <Sparkles size={15} /> : selectedConversation.type === 'COMPANY' ? <Building2 size={15} /> : <AtSign size={15} />}
                <span>{canWriteSelected ? tr('Reply, mention, forward, edit, delete, read status', 'Reply, mention, forward, edit, delete, read status') : tr('Read only', 'Faqat o\'qish')}</span>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto scroller-minimal p-3 md:p-4 space-y-3 bg-background/40">
              {messagesLoading && <p className="text-sm text-muted">{tr('Loading messages...', 'Xabarlar yuklanmoqda...')}</p>}
              {!messagesLoading && visibleMessages.length === 0 && (
                <div className="h-full min-h-[280px] flex items-center justify-center text-center">
                  <div>
                    <SelectedHeaderIcon size={38} className="mx-auto text-muted" />
                    <h3 className="mt-3 text-lg font-bold text-foreground">
                      {selectedConversation.type === 'SUPPORT'
                        ? tr('No support messages yet', 'Support xabarlari hali yo\'q')
                        : selectedConversation.type === 'COMPANY'
                          ? tr('No announcements yet', 'Hozircha e\'lon yo\'q')
                          : selectedConversation.type === 'AI'
                            ? tr('How can I help within your permissions?', 'Ruxsatlaringiz doirasida qanday yordam beray?')
                            : tr('No messages yet', 'Hali xabar yo\'q')}
                    </h3>
                    <p className="mt-1 text-sm text-muted">{conversationSubtitle(selectedConversation)}</p>
                  </div>
                </div>
              )}
              {visibleMessages.map((row) => {
                const mine = row.senderUserId === user?.id;
                return (
                  <div key={row.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                    <div className={`group max-w-[min(820px,88vw)] rounded-md border p-3 ${mine ? 'bg-primary text-primary-foreground border-primary' : 'bg-surface border-border text-foreground'}`}>
                      <div className="flex items-center gap-2 text-[11px] opacity-80">
                        <span className="font-semibold">{row.sender?.fullName || row.sender?.email || 'AI Assistant'}</span>
                        <span>{formatTime(row.createdAt)}</span>
                        {row.editedAt && <span>{tr('edited', 'tahrirlangan')}</span>}
                        {row.forwardedFromId && <span>{tr('forwarded', 'forward')}</span>}
                      </div>
                      {row.replyToMessage && (
                        <div className="mt-2 rounded border border-current/20 px-2 py-1 text-xs opacity-80">
                          {tr('Reply to', 'Reply')}: {row.replyToMessage.content || row.replyToMessage.attachment?.name}
                        </div>
                      )}
                      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">
                        {row.deletedAt ? tr('This message was deleted', 'Bu xabar o\'chirilgan') : row.content}
                      </p>
                      {row.attachment && !row.deletedAt && (
                        <div className="mt-2 flex items-center gap-2 rounded border border-current/20 px-2 py-1 text-xs">
                          <Paperclip size={14} />
                          <span className="truncate">{row.attachment.name || row.kind}</span>
                        </div>
                      )}
                      {!row.deletedAt && (
                        <div className="mt-3 flex flex-wrap items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                          {canWriteSelected && <button type="button" onClick={() => setReplyTo(row)} className="p-1 rounded hover:bg-black/10" title="Reply"><Reply size={14} /></button>}
                          {canWriteSelected && <button type="button" onClick={() => forwardMessage(row)} className="p-1 rounded hover:bg-black/10" title="Forward"><Forward size={14} /></button>}
                          {mine && canWriteSelected && <button type="button" onClick={() => { setEditing(row); setMessage(row.content || ''); }} className="p-1 rounded hover:bg-black/10" title="Edit"><Edit3 size={14} /></button>}
                          {(mine || String(user?.role).toUpperCase() !== 'FIRM') && <button type="button" onClick={() => deleteMessage(row.id)} className="p-1 rounded hover:bg-black/10" title="Delete"><Trash2 size={14} /></button>}
                          <span className="ml-auto inline-flex items-center gap-1 text-[11px] opacity-80">
                            <CheckCheck size={14} />
                            {readCount(row)}/{activeParticipants.length}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {canWriteSelected ? (
            <form onSubmit={sendMessage} className="border-t border-border bg-surface p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
              {(replyTo || editing) && (
                <div className="mb-2 flex items-center justify-between gap-3 rounded-md border border-border bg-surface-2 px-3 py-2 text-sm">
                  <span className="truncate">
                    {editing ? tr('Editing', 'Tahrirlash') : tr('Replying to', 'Reply')}: {(editing || replyTo)?.content || (editing || replyTo)?.attachment?.name}
                  </span>
                  <button type="button" onClick={resetComposer} className="text-muted hover:text-foreground">x</button>
                </div>
              )}
              <div className="flex flex-wrap gap-2 mb-2">
                {kindButtons.map((item) => {
                  const Icon = item.icon;
                  const active = kind === item.kind;
                  return (
                    <button
                      key={item.kind}
                      type="button"
                      onClick={() => setKind(item.kind)}
                      title={item.label}
                      className={`h-9 w-9 rounded-md border flex items-center justify-center ${active ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted hover:text-foreground'}`}
                    >
                      <Icon size={16} />
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-2">
                <textarea
                  value={message}
                  onFocus={() => setIsTyping(true)}
                  onBlur={() => setIsTyping(false)}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={2}
                  placeholder={kind === 'TEXT' ? tr('Message...', 'Xabar...') : tr('Type caption or file name...', 'Izoh yoki fayl nomini yozing...')}
                  className="compact-control min-h-[52px] resize-none"
                />
                <button type="submit" className="min-h-[52px] w-12 shrink-0 rounded-md bg-primary text-primary-foreground flex items-center justify-center">
                  <Send size={18} />
                </button>
              </div>
            </form>
            ) : (
              <div className="border-t border-border p-4 bg-surface text-sm text-muted">
                {tr('This channel is read only for your role.', 'Bu kanal sizning rolingiz uchun faqat o\'qish rejimida.')}
              </div>
            )}
          </>
        ) : (
          <div className="h-full flex items-center justify-center p-8 text-center">
            <div>
              <MessageCircle size={40} className="mx-auto text-muted" />
              <h3 className="mt-3 text-xl font-bold text-foreground">{tr('No chats yet', 'Hali chat yo\'q')}</h3>
              <p className="mt-1 text-sm text-muted">{tr('Create a personal or department chat to begin.', 'Boshlash uchun personal yoki department chat yarating.')}</p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
