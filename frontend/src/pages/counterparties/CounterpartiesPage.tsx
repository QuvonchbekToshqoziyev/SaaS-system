import { useEffect, useState } from 'react';
import Navbar from '../../components/layout/Navbar';
import { useAuth } from '../../context/AuthContext';
import { counterpartiesApi } from '../../api';
import { Plus, UserCheck, Edit, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';

export default function CounterpartiesPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', inn: '', type: 'supplier', contactPerson: '', phone: '', email: '', address: '' });

  const companyId = user?.companyId;

  const load = () => {
    if (!companyId) return;
    setLoading(true);
    counterpartiesApi.getByCompany(companyId)
      .then((res) => setItems(Array.isArray(res.data) ? res.data : res.data.data || []))
      .catch(() => toast.error('Kontragentlarni yuklashda xatolik'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [companyId]);

  const openCreate = () => { setEditId(null); setForm({ name: '', inn: '', type: 'supplier', contactPerson: '', phone: '', email: '', address: '' }); setShowModal(true); };
  const openEdit = (c: any) => { setEditId(c.id); setForm({ name: c.name, inn: c.inn || '', type: c.type || 'supplier', contactPerson: c.contactPerson || '', phone: c.phone || '', email: c.email || '', address: c.address || '' }); setShowModal(true); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editId) { await counterpartiesApi.update(editId, form); toast.success('Yangilandi'); }
      else { await counterpartiesApi.create({ ...form, companyId }); toast.success('Yaratildi'); }
      setShowModal(false); load();
    } catch (err: any) { toast.error(err.response?.data?.message || 'Xatolik'); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("O'chirishni tasdiqlaysizmi?")) return;
    try { await counterpartiesApi.delete(id); toast.success("O'chirildi"); load(); } catch { toast.error('Xatolik'); }
  };

  const typeLabel = (t: string) => t === 'supplier' ? 'Yetkazuvchi' : t === 'customer' ? 'Mijoz' : 'Boshqa';

  return (
    <>
      <Navbar title="Kontragentlar" />
      <div className="page-content">
        <div className="page-header">
          <h1>Kontragentlar</h1>
          <div className="page-actions">
            <button className="btn btn-primary" onClick={openCreate}><Plus size={18} /> Yangi</button>
          </div>
        </div>

        <div className="glass-card" style={{ padding: 0 }}>
          {loading ? (
            <div className="loading-center"><div className="spinner" /></div>
          ) : items.length === 0 ? (
            <div className="empty-state"><UserCheck size={48} /><h3>Kontragent topilmadi</h3></div>
          ) : (
            <table className="glass-table">
              <thead>
                <tr><th>Nomi</th><th>Turi</th><th>INN</th><th>Aloqa</th><th>Telefon</th><th></th></tr>
              </thead>
              <tbody>
                {items.map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 600 }}>{c.name}</td>
                    <td><span className={`badge badge-${c.type === 'supplier' ? 'info' : c.type === 'customer' ? 'success' : 'warning'}`}>{typeLabel(c.type)}</span></td>
                    <td style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{c.inn || '—'}</td>
                    <td>{c.contactPerson || '—'}</td>
                    <td>{c.phone || '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="navbar-btn" style={{ width: 32, height: 32, borderRadius: 8 }} onClick={() => openEdit(c)}><Edit size={14} /></button>
                        <button className="navbar-btn" style={{ width: 32, height: 32, borderRadius: 8 }} onClick={() => handleDelete(c.id)}><Trash2 size={14} /></button>
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
                <h2>{editId ? 'Tahrirlash' : 'Yangi kontragent'}</h2>
                <button className="modal-close" onClick={() => setShowModal(false)}><X size={18} /></button>
              </div>
              <form onSubmit={handleSubmit}>
                <div className="form-group"><label>Nomi</label><input className="form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div className="form-group"><label>Turi</label>
                    <select className="form-select" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                      <option value="supplier">Yetkazuvchi</option><option value="customer">Mijoz</option><option value="other">Boshqa</option>
                    </select>
                  </div>
                  <div className="form-group"><label>INN</label><input className="form-input" value={form.inn} onChange={(e) => setForm({ ...form, inn: e.target.value })} /></div>
                </div>
                <div className="form-group"><label>Aloqa shaxs</label><input className="form-input" value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} /></div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div className="form-group"><label>Telefon</label><input className="form-input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                  <div className="form-group"><label>Email</label><input className="form-input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                </div>
                <div className="form-group"><label>Manzil</label><input className="form-input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
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
