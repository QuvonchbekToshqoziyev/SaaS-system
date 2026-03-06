import { useEffect, useState } from 'react';
import Navbar from '../../components/layout/Navbar';
import { usersApi } from '../../api';
import { Plus, Shield, Edit, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';

const ROLES = [
  { value: 'platform_admin', label: 'Platform Admin' },
  { value: 'accountant_admin', label: 'Bosh Hisobchi' },
  { value: 'accountant', label: 'Hisobchi' },
  { value: 'client_admin', label: 'Klient Admin' },
  { value: 'client_user', label: 'Klient' },
  { value: 'viewer', label: "Ko'ruvchi" },
];

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', role: 'client_user', password: '' });

  const load = () => {
    setLoading(true);
    usersApi.getAll()
      .then((res) => setUsers(Array.isArray(res.data) ? res.data : res.data.data || []))
      .catch(() => toast.error('Foydalanuvchilarni yuklashda xatolik'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditId(null); setForm({ firstName: '', lastName: '', email: '', phone: '', role: 'client_user', password: '' }); setShowModal(true); };
  const openEdit = (u: any) => { setEditId(u.id); setForm({ firstName: u.firstName, lastName: u.lastName || '', email: u.email, phone: u.phone || '', role: u.role, password: '' }); setShowModal(true); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const data: any = { ...form };
      if (!data.password) delete data.password;
      if (editId) { await usersApi.update(editId, data); toast.success('Yangilandi'); }
      else { await usersApi.create(data); toast.success('Yaratildi'); }
      setShowModal(false); load();
    } catch (err: any) { toast.error(err.response?.data?.message || 'Xatolik'); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("O'chirishni tasdiqlaysizmi?")) return;
    try { await usersApi.delete(id); toast.success("O'chirildi"); load(); } catch { toast.error('Xatolik'); }
  };

  const roleLabel = (role: string) => ROLES.find((r) => r.value === role)?.label || role;
  const roleColor = (role: string) => {
    if (role.includes('admin')) return 'danger';
    if (role.includes('accountant')) return 'info';
    if (role.includes('viewer')) return 'warning';
    return 'success';
  };

  return (
    <>
      <Navbar title="Foydalanuvchilar" />
      <div className="page-content">
        <div className="page-header">
          <h1>Foydalanuvchilar</h1>
          <div className="page-actions">
            <button className="btn btn-primary" onClick={openCreate}><Plus size={18} /> Yangi</button>
          </div>
        </div>

        <div className="glass-card" style={{ padding: 0 }}>
          {loading ? (
            <div className="loading-center"><div className="spinner" /></div>
          ) : users.length === 0 ? (
            <div className="empty-state"><Shield size={48} /><h3>Foydalanuvchi topilmadi</h3></div>
          ) : (
            <table className="glass-table">
              <thead>
                <tr><th>Ism</th><th>Email</th><th>Role</th><th>Holat</th><th>Sana</th><th></th></tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg, #4361EE, #7C3AED)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFFFFF', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
                          {u.firstName?.[0]}{u.lastName?.[0]}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600 }}>{u.firstName} {u.lastName}</div>
                          {u.phone && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{u.phone}</div>}
                        </div>
                      </div>
                    </td>
                    <td style={{ color: 'var(--text-secondary)' }}>{u.email}</td>
                    <td><span className={`badge badge-${roleColor(u.role)}`}>{roleLabel(u.role)}</span></td>
                    <td>
                      {u.isActive
                        ? <span className="badge badge-success">Faol</span>
                        : <span className="badge badge-danger">Bloklangan</span>}
                    </td>
                    <td style={{ fontSize: 13, color: 'var(--text-muted)' }}>{new Date(u.createdAt).toLocaleDateString('uz-UZ')}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="navbar-btn" style={{ width: 32, height: 32, borderRadius: 8 }} onClick={() => openEdit(u)}><Edit size={14} /></button>
                        <button className="navbar-btn" style={{ width: 32, height: 32, borderRadius: 8 }} onClick={() => handleDelete(u.id)}><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {showModal && (
          <div className="modal-overlay" onClick={() => setShowModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>{editId ? 'Tahrirlash' : 'Yangi foydalanuvchi'}</h2>
                <button className="modal-close" onClick={() => setShowModal(false)}><X size={18} /></button>
              </div>
              <form onSubmit={handleSubmit}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div className="form-group"><label>Ism</label><input className="form-input" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required /></div>
                  <div className="form-group"><label>Familiya</label><input className="form-input" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></div>
                </div>
                <div className="form-group"><label>Email</label><input className="form-input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div className="form-group"><label>Telefon</label><input className="form-input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                  <div className="form-group"><label>Role</label>
                    <select className="form-select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                      {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                  </div>
                </div>
                <div className="form-group"><label>{editId ? 'Yangi parol (bo\'sh qoldirsa o\'zgarmaydi)' : 'Parol'}</label><input className="form-input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} {...(!editId ? { required: true } : {})} /></div>
                <button className="btn btn-primary" type="submit" style={{ width: '100%', justifyContent: 'center' }}>
                  {editId ? 'Saqlash' : 'Yaratish'}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
