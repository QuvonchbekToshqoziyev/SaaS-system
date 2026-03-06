import { useEffect, useState } from 'react';
import Navbar from '../../components/layout/Navbar';
import { useAuth } from '../../context/AuthContext';
import { employeesApi } from '../../api';
import { Plus, UserCog, Edit, Trash2, X, Phone } from 'lucide-react';
import toast from 'react-hot-toast';

export default function EmployeesPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ firstName: '', lastName: '', position: '', phone: '', salary: '', hireDate: '' });

  const companyId = user?.companyId;

  const load = () => {
    if (!companyId) return;
    setLoading(true);
    employeesApi.getByCompany(companyId)
      .then((res) => setItems(Array.isArray(res.data) ? res.data : res.data.data || []))
      .catch(() => toast.error('Xodimlarni yuklashda xatolik'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [companyId]);

  const openCreate = () => { setEditId(null); setForm({ firstName: '', lastName: '', position: '', phone: '', salary: '', hireDate: '' }); setShowModal(true); };
  const openEdit = (e: any) => {
    setEditId(e.id);
    setForm({ firstName: e.firstName, lastName: e.lastName || '', position: e.position || '', phone: e.phone || '', salary: String(e.salary || ''), hireDate: e.hireDate ? e.hireDate.split('T')[0] : '' });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const data = { ...form, salary: form.salary ? parseFloat(form.salary) : undefined, companyId };
    try {
      if (editId) { await employeesApi.update(editId, data); toast.success('Yangilandi'); }
      else { await employeesApi.create(data); toast.success('Yaratildi'); }
      setShowModal(false); load();
    } catch (err: any) { toast.error(err.response?.data?.message || 'Xatolik'); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("O'chirishni tasdiqlaysizmi?")) return;
    try { await employeesApi.delete(id); toast.success("O'chirildi"); load(); } catch { toast.error('Xatolik'); }
  };

  return (
    <>
      <Navbar title="Xodimlar" />
      <div className="page-content">
        <div className="page-header">
          <h1>Xodimlar</h1>
          <div className="page-actions">
            <button className="btn btn-primary" onClick={openCreate}><Plus size={18} /> Yangi</button>
          </div>
        </div>

        {loading ? (
          <div className="loading-center"><div className="spinner" /></div>
        ) : items.length === 0 ? (
          <div className="empty-state"><UserCog size={48} /><h3>Xodim topilmadi</h3></div>
        ) : (
          <div className="card-grid">
            {items.map((emp) => (
              <div className="glass-card" key={emp.id} style={{ padding: 24 }}>
                <div className="card-top-line" />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                  <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'linear-gradient(135deg, #4361EE, #7C3AED)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFFFFF', fontWeight: 700, fontSize: 16 }}>
                    {emp.firstName?.[0]}{emp.lastName?.[0]}
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="navbar-btn" style={{ width: 32, height: 32, borderRadius: 8 }} onClick={() => openEdit(emp)}><Edit size={14} /></button>
                    <button className="navbar-btn" style={{ width: 32, height: 32, borderRadius: 8 }} onClick={() => handleDelete(emp.id)}><Trash2 size={14} /></button>
                  </div>
                </div>
                <h3 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 4px' }}>{emp.firstName} {emp.lastName}</h3>
                {emp.position && <p style={{ fontSize: 13, color: '#4361EE', margin: '0 0 12px' }}>{emp.position}</p>}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
                  {emp.phone && <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Phone size={14} /> {emp.phone}</div>}
                  {emp.salary && <div className="text-mono" style={{ fontWeight: 600 }}>{new Intl.NumberFormat('uz-UZ').format(emp.salary)} UZS/oy</div>}
                  {emp.hireDate && <div style={{ color: 'var(--text-muted)' }}>Ishga qabul: {new Date(emp.hireDate).toLocaleDateString('uz-UZ')}</div>}
                </div>
              </div>
            ))}
          </div>
        )}

        {showModal && (
          <div className="modal-overlay" onClick={() => setShowModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>{editId ? 'Tahrirlash' : 'Yangi xodim'}</h2>
                <button className="modal-close" onClick={() => setShowModal(false)}><X size={18} /></button>
              </div>
              <form onSubmit={handleSubmit}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div className="form-group"><label>Ism</label><input className="form-input" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required /></div>
                  <div className="form-group"><label>Familiya</label><input className="form-input" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></div>
                </div>
                <div className="form-group"><label>Lavozim</label><input className="form-input" value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} /></div>
                <div className="form-group"><label>Telefon</label><input className="form-input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div className="form-group"><label>Oylik (UZS)</label><input className="form-input" type="number" value={form.salary} onChange={(e) => setForm({ ...form, salary: e.target.value })} /></div>
                  <div className="form-group"><label>Ishga qabul sanasi</label><input className="form-input" type="date" value={form.hireDate} onChange={(e) => setForm({ ...form, hireDate: e.target.value })} /></div>
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
