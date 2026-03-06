import { useEffect, useState } from 'react';
import Navbar from '../../components/layout/Navbar';
import { companiesApi } from '../../api';
import { Plus, Building2, Edit, Trash2, X, Users } from 'lucide-react';
import toast from 'react-hot-toast';

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', inn: '', address: '', phone: '', bankAccount: '' });

  const load = () => {
    setLoading(true);
    companiesApi.getAll()
      .then((res) => setCompanies(Array.isArray(res.data) ? res.data : res.data.data || []))
      .catch(() => toast.error('Kompaniyalarni yuklashda xatolik'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditId(null); setForm({ name: '', inn: '', address: '', phone: '', bankAccount: '' }); setShowModal(true); };
  const openEdit = (c: any) => { setEditId(c.id); setForm({ name: c.name, inn: c.inn || '', address: c.address || '', phone: c.phone || '', bankAccount: c.bankAccount || '' }); setShowModal(true); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editId) {
        await companiesApi.update(editId, form);
        toast.success('Yangilandi');
      } else {
        await companiesApi.create(form);
        toast.success('Kompaniya yaratildi');
      }
      setShowModal(false);
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Xatolik');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("O'chirishni tasdiqlaysizmi?")) return;
    try { await companiesApi.delete(id); toast.success("O'chirildi"); load(); } catch { toast.error('Xatolik'); }
  };

  return (
    <>
      <Navbar title="Kompaniyalar" />
      <div className="page-content">
        <div className="page-header">
          <h1>Kompaniyalar</h1>
          <div className="page-actions">
            <button className="btn btn-primary" onClick={openCreate}><Plus size={18} /> Yangi</button>
          </div>
        </div>

        {loading ? (
          <div className="loading-center"><div className="spinner" /></div>
        ) : companies.length === 0 ? (
          <div className="empty-state"><Building2 size={48} /><h3>Kompaniya topilmadi</h3><p>Yangi kompaniya qo'shing</p></div>
        ) : (
          <div className="card-grid">
            {companies.map((c) => (
              <div className="glass-card" key={c.id} style={{ padding: 24 }}>
                <div className="card-top-line" />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                  <div style={{ width: 48, height: 48, borderRadius: 8, background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--card-border)' }}>
                    <Building2 size={22} style={{ color: '#4361EE' }} />
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="navbar-btn" style={{ width: 32, height: 32, borderRadius: 8 }} onClick={() => openEdit(c)}><Edit size={14} /></button>
                    <button className="navbar-btn" style={{ width: 32, height: 32, borderRadius: 8 }} onClick={() => handleDelete(c.id)}><Trash2 size={14} /></button>
                  </div>
                </div>
                <h3 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 4px' }}>{c.name}</h3>
                {c.inn && <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 12px' }}>INN: {c.inn}</p>}
                <div style={{ display: 'flex', gap: 12, fontSize: 13, color: 'var(--text-secondary)' }}>
                  {c.address && <span>{c.address}</span>}
                  {c.phone && <span>{c.phone}</span>}
                </div>
                {c._count?.users != null && (
                  <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-muted)' }}>
                    <Users size={14} /> {c._count.users} foydalanuvchi
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {showModal && (
          <div className="modal-overlay" onClick={() => setShowModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>{editId ? 'Tahrirlash' : 'Yangi kompaniya'}</h2>
                <button className="modal-close" onClick={() => setShowModal(false)}><X size={18} /></button>
              </div>
              <form onSubmit={handleSubmit}>
                <div className="form-group"><label>Nomi</label><input className="form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
                <div className="form-group"><label>INN</label><input className="form-input" value={form.inn} onChange={(e) => setForm({ ...form, inn: e.target.value })} /></div>
                <div className="form-group"><label>Manzil</label><input className="form-input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
                <div className="form-group"><label>Telefon</label><input className="form-input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                <div className="form-group"><label>Bank hisob raqami</label><input className="form-input" value={form.bankAccount} onChange={(e) => setForm({ ...form, bankAccount: e.target.value })} /></div>
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
