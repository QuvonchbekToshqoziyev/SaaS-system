import { useEffect, useState } from 'react';
import Navbar from '../../components/layout/Navbar';
import { useAuth } from '../../context/AuthContext';
import { branchesApi } from '../../api';
import { Plus, MapPin, Edit, Trash2, X, Phone } from 'lucide-react';
import toast from 'react-hot-toast';

export default function BranchesPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', address: '', phone: '', manager: '' });

  const companyId = user?.companyId;

  const load = () => {
    if (!companyId) return;
    setLoading(true);
    branchesApi.getByCompany(companyId)
      .then((res) => setItems(Array.isArray(res.data) ? res.data : res.data.data || []))
      .catch(() => toast.error('Filiallarni yuklashda xatolik'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [companyId]);

  const openCreate = () => { setEditId(null); setForm({ name: '', address: '', phone: '', manager: '' }); setShowModal(true); };
  const openEdit = (b: any) => { setEditId(b.id); setForm({ name: b.name, address: b.address || '', phone: b.phone || '', manager: b.manager || '' }); setShowModal(true); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editId) { await branchesApi.update(editId, form); toast.success('Yangilandi'); }
      else { await branchesApi.create({ ...form, companyId }); toast.success('Yaratildi'); }
      setShowModal(false); load();
    } catch (err: any) { toast.error(err.response?.data?.message || 'Xatolik'); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("O'chirishni tasdiqlaysizmi?")) return;
    try { await branchesApi.delete(id); toast.success("O'chirildi"); load(); } catch { toast.error('Xatolik'); }
  };

  return (
    <>
      <Navbar title="Filiallar" />
      <div className="page-content">
        <div className="page-header">
          <h1>Filiallar</h1>
          <div className="page-actions">
            <button className="btn btn-primary" onClick={openCreate}><Plus size={18} /> Yangi</button>
          </div>
        </div>

        {loading ? (
          <div className="loading-center"><div className="spinner" /></div>
        ) : items.length === 0 ? (
          <div className="empty-state"><MapPin size={48} /><h3>Filial topilmadi</h3></div>
        ) : (
          <div className="card-grid">
            {items.map((b) => (
              <div className="glass-card" key={b.id} style={{ padding: 24 }}>
                <div className="card-top-line" />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                  <div style={{ width: 48, height: 48, borderRadius: 8, background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--card-border)' }}>
                    <MapPin size={22} style={{ color: '#EF4444' }} />
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="navbar-btn" style={{ width: 32, height: 32, borderRadius: 8 }} onClick={() => openEdit(b)}><Edit size={14} /></button>
                    <button className="navbar-btn" style={{ width: 32, height: 32, borderRadius: 8 }} onClick={() => handleDelete(b.id)}><Trash2 size={14} /></button>
                  </div>
                </div>
                <h3 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 8px' }}>{b.name}</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: 'var(--text-secondary)' }}>
                  {b.address && <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><MapPin size={14} /> {b.address}</div>}
                  {b.phone && <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Phone size={14} /> {b.phone}</div>}
                  {b.manager && <div style={{ marginTop: 4, color: 'var(--text-muted)' }}>Menejer: {b.manager}</div>}
                </div>
              </div>
            ))}
          </div>
        )}

        {showModal && (
          <div className="modal-overlay" onClick={() => setShowModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>{editId ? 'Tahrirlash' : 'Yangi filial'}</h2>
                <button className="modal-close" onClick={() => setShowModal(false)}><X size={18} /></button>
              </div>
              <form onSubmit={handleSubmit}>
                <div className="form-group"><label>Nomi</label><input className="form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
                <div className="form-group"><label>Manzil</label><input className="form-input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div className="form-group"><label>Telefon</label><input className="form-input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                  <div className="form-group"><label>Menejer</label><input className="form-input" value={form.manager} onChange={(e) => setForm({ ...form, manager: e.target.value })} /></div>
                </div>
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
