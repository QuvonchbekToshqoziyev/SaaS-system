import { useEffect, useState, useRef } from 'react';
import Navbar from '../../components/layout/Navbar';
import { useAuth } from '../../context/AuthContext';
import { chatApi } from '../../api';
import { Send, Plus, Hash, Users } from 'lucide-react';
import { io, Socket } from 'socket.io-client';
import toast from 'react-hot-toast';

export default function ChatPage() {
  const { user } = useAuth();
  const [rooms, setRooms] = useState<any[]>([]);
  const [activeRoom, setActiveRoom] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [showNewRoom, setShowNewRoom] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);

  // Load rooms
  useEffect(() => {
    chatApi.getRooms()
      .then((res) => setRooms(Array.isArray(res.data) ? res.data : res.data.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // WebSocket connection
  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) return;
    const socket = io(import.meta.env.VITE_API_URL || 'http://localhost:3000', {
      auth: { token },
      transports: ['websocket'],
    });
    socketRef.current = socket;

    socket.on('newMessage', (msg) => {
      setMessages((prev) => [...prev, msg]);
    });

    return () => { socket.disconnect(); };
  }, []);

  // Load messages when room changes
  useEffect(() => {
    if (!activeRoom) return;
    chatApi.getMessages(activeRoom)
      .then((res) => setMessages(Array.isArray(res.data) ? res.data : res.data.data || []))
      .catch(() => toast.error('Xabarlarni yuklashda xatolik'));
    socketRef.current?.emit('joinRoom', activeRoom);
  }, [activeRoom]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !activeRoom) return;
    socketRef.current?.emit('sendMessage', { roomId: activeRoom, content: text });
    // Optimistic
    setMessages((prev) => [...prev, { id: Date.now(), content: text, sender: user, createdAt: new Date().toISOString() }]);
    setText('');
  };

  const createRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await chatApi.createRoom({ name: newRoomName });
      setRooms((prev) => [...prev, res.data]);
      setActiveRoom(res.data.id);
      setShowNewRoom(false);
      setNewRoomName('');
      toast.success('Xona yaratildi');
    } catch { toast.error('Xatolik'); }
  };

  const activeRoomData = rooms.find((r) => r.id === activeRoom);

  const formatTime = (d: string) => {
    const date = new Date(d);
    return date.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
  };

  const isMyMessage = (msg: any) => msg.sender?.id === user?.id || msg.senderId === user?.id;

  return (
    <>
      <Navbar title="Chat" />
      <div className="page-content" style={{ padding: 0, height: 'calc(100vh - 70px)' }}>
        <div className="chat-layout">
          {/* Sidebar */}
          <div className="chat-sidebar">
            <div className="chat-sidebar-header">
              <h3>Xonalar</h3>
              <button className="navbar-btn" style={{ width: 32, height: 32, borderRadius: 8 }} onClick={() => setShowNewRoom(true)}>
                <Plus size={16} />
              </button>
            </div>

            {showNewRoom && (
              <form onSubmit={createRoom} style={{ padding: '0 16px 16px' }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input className="form-input" style={{ fontSize: 13, padding: '8px 12px' }} placeholder="Xona nomi..." value={newRoomName} onChange={(e) => setNewRoomName(e.target.value)} required />
                  <button className="btn btn-primary" type="submit" style={{ padding: '8px 12px', fontSize: 13 }}>+</button>
                </div>
              </form>
            )}

            <div className="chat-room-list">
              {loading ? (
                <div className="loading-center"><div className="spinner" /></div>
              ) : rooms.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Xonalar yo'q</div>
              ) : rooms.map((r) => (
                <div key={r.id} className={`chat-room-item ${activeRoom === r.id ? 'active' : ''}`} onClick={() => setActiveRoom(r.id)}>
                  <div className="chat-room-icon"><Hash size={16} /></div>
                  <div className="chat-room-info">
                    <div className="chat-room-name">{r.name}</div>
                    {r.lastMessage && <div className="chat-room-last">{r.lastMessage.content?.slice(0, 40)}</div>}
                  </div>
                  {r.unreadCount > 0 && <div className="chat-unread-badge">{r.unreadCount}</div>}
                </div>
              ))}
            </div>
          </div>

          {/* Main Chat Area */}
          <div className="chat-main">
            {!activeRoom ? (
              <div className="chat-empty">
                <Hash size={48} style={{ color: 'var(--text-muted)' }} />
                <h3>Xonani tanlang</h3>
                <p>Chat boshlash uchun xonalardan birini tanlang</p>
              </div>
            ) : (
              <>
                <div className="chat-header">
                  <Hash size={18} style={{ color: 'var(--brand-primary)' }} />
                  <h3>{activeRoomData?.name || 'Chat'}</h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
                    <Users size={16} style={{ color: 'var(--text-muted)' }} />
                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{activeRoomData?.members?.length || 0}</span>
                  </div>
                </div>

                <div className="chat-messages">
                  {messages.map((msg) => (
                    <div key={msg.id} className={`chat-message ${isMyMessage(msg) ? 'mine' : ''}`}>
                      {!isMyMessage(msg) && (
                        <div className="chat-message-avatar">
                          {msg.sender?.firstName?.[0] || '?'}
                        </div>
                      )}
                      <div className="chat-message-body">
                        {!isMyMessage(msg) && (
                          <div className="chat-message-sender">{msg.sender?.firstName} {msg.sender?.lastName}</div>
                        )}
                        <div className="chat-message-content">{msg.content}</div>
                        <div className="chat-message-time">{formatTime(msg.createdAt)}</div>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>

                <form className="chat-input-area" onSubmit={sendMessage}>
                  <input
                    className="chat-input"
                    placeholder="Xabar yozing..."
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                  />
                  <button className="chat-send-btn" type="submit" disabled={!text.trim()}>
                    <Send size={18} />
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
