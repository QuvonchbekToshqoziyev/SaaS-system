import { useEffect, useState } from 'react';
import Navbar from '../../components/layout/Navbar';
import { useAuth } from '../../context/AuthContext';
import { transactionsApi } from '../../api';
import { Plus, ArrowUpRight, ArrowDownRight, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';

export default function TransactionsPage() {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ type: 'income', amount: '', currency: 'UZS', category: '', description: '', counterpartyId: '' });

  const companyId = user?.companyId;

  const load = () => {
    if (!companyId) return;
    setLoading(true);
    const params: any = {};
    if (filter !== 'all') params.type = filter;
    transactionsApi.getByCompany(companyId, params)
      .then((res) => setTransactions(res.data))
      .catch(() => toast.error('Tranzaksiyalarni yuklashda xatolik'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [companyId, filter]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await transactionsApi.create({ ...form, amount: parseFloat(form.amount), companyId });
      toast.success('Tranzaksiya yaratildi');
      setShowModal(false);
      setForm({ type: 'income', amount: '', currency: 'UZS', category: '', description: '', counterpartyId: '' });
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Xatolik');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("O'chirishni tasdiqlaysizmi?")) return;
    try {
      await transactionsApi.delete(id);
      toast.success("O'chirildi");
      load();
    } catch { toast.error('Xatolik'); }
  };

  const formatMoney = (v: number, currency: string) =>
    new Intl.NumberFormat('uz-UZ').format(Math.round(v)) + ' ' + currency;

  return (
    <>
      <Navbar title="Tranzaksiyalar" />
      <div className="page-content">
        <div className="page-header">
          <h1>Tranzaksiyalar</h1>
          <div className="page-actions">
            <button className="btn btn-primary" onClick={() => setShowModal(true)}><Plus size={18} /> Yangi</button>
          </div>
        </div>

        <div className="filter-pills">
          {[{ key: 'all', label: 'Barchasi' }, { key: 'income', label: 'Daromad' }, { key: 'expense', label: 'Xarajat' }].map((f) => (
            <button key={f.key} className={`filter-pill ${filter === f.key ? 'active' : ''}`} onClick={() => setFilter(f.key)}>
              {f.label}
            </button>
          ))}
        </div>

        <div className="glass-card" style={{ padding: 0 }}>
          {loading ? (
            <div className="loading-center"><div className="spinner" /></div>
          ) : transactions.length === 0 ? (
            <div className="empty-state"><h3>Tranzaksiya topilmadi</h3></div>
          ) : (
            <table className="glass-table">
              <thead>
                <tr>
                  <th>Turi</th>
                  <th>Summa</th>
                  <th>Kategoriya</th>
                  <th>Tavsif</th>
                  <th>Status</th>
                  <th>Sana</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <div className="flex items-center gap-1">
                        {t.type === 'income'
                          ? <ArrowUpRight size={16} style={{ color: 'var(--success)' }} />
                          : <ArrowDownRight size={16} style={{ color: 'var(--danger)' }} />}
                        {t.type === 'income' ? 'Daromad' : 'Xarajat'}
                      </div>
                    </td>
                    <td>
                      <span className={`text-mono ${t.type === 'income' ? 'text-success' : 'text-danger'}`} style={{ fontWeight: 600 }}>
                        {t.type === 'income' ? '+' : '-'}{formatMoney(t.amount, t.currency)}
                      </span>
                    </td>
                    <td>{t.category || '—'}</td>
                    <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.description || '—'}</td>
                    <td>
                      <span className={`badge badge-${t.status === 'approved' ? 'success' : t.status === 'rejected' ? 'danger' : 'warning'}`}>
                        {t.status === 'approved' ? 'Tasdiqlangan' : t.status === 'rejected' ? 'Rad etilgan' : 'Kutilmoqda'}
                      </span>
                    </td>
                    <td style={{ fontSize: 13, color: 'var(--text-muted)' }}>{new Date(t.createdAt).toLocaleDateString('uz-UZ')}</td>
                    <td>
                      <button className="navbar-btn" style={{ width: 32, height: 32, borderRadius: 8 }} onClick={() => handleDelete(t.id)}>
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Create Modal */}
        {showModal && (
          <div className="modal-overlay" onClick={() => setShowModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Yangi tranzaksiya</h2>
                <button className="modal-close" onClick={() => setShowModal(false)}><X size={18} /></button>
              </div>
              <form onSubmit={handleCreate}>
                <div className="form-group">
                  <label>Turi</label>
                  <select className="form-select" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                    <option value="income">Daromad</option>
                    <option value="expense">Xarajat</option>
                  </select>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
                  <div className="form-group">
                    <label>Summa</label>
                    <input className="form-input" type="number" placeholder="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
                  </div>
                  <div className="form-group">
                    <label>Valyuta</label>
                    <select className="form-select" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                      <option value="UZS">UZS</option>
                      <option value="USD">USD</option>
                      <option value="EUR">EUR</option>
                      <option value="RUB">RUB</option>
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label>Kategoriya</label>
                  <input className="form-input" placeholder="Masalan: Sotish, Xarid..." value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Tavsif</label>
                  <textarea className="form-textarea" placeholder="Qo'shimcha ma'lumot..." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                </div>
                <button className="btn btn-primary" type="submit" style={{ width: '100%', justifyContent: 'center' }}>
                  <Plus size={18} /> Yaratish
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
