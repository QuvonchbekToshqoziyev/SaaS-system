import { useEffect, useState } from 'react';
import Navbar from '../../components/layout/Navbar';
import { useAuth } from '../../context/AuthContext';
import { inventoryApi } from '../../api';
import { Plus, Package, Edit, Trash2, X, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';

export default function InventoryPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', sku: '', unit: 'dona', quantity: '', price: '', minQuantity: '' });

  const companyId = user?.companyId;

  const load = () => {
    if (!companyId) return;
    setLoading(true);
    inventoryApi.getByCompany(companyId)
      .then((res) => setItems(Array.isArray(res.data) ? res.data : res.data.data || []))
      .catch(() => toast.error('Omborni yuklashda xatolik'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [companyId]);

  const openCreate = () => { setEditId(null); setForm({ name: '', sku: '', unit: 'dona', quantity: '', price: '', minQuantity: '' }); setShowModal(true); };
  const openEdit = (i: any) => { setEditId(i.id); setForm({ name: i.name, sku: i.sku || '', unit: i.unit || 'dona', quantity: String(i.quantity || 0), price: String(i.price || 0), minQuantity: String(i.minQuantity || 0) }); setShowModal(true); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const data = { ...form, quantity: parseFloat(form.quantity || '0'), price: parseFloat(form.price || '0'), minQuantity: parseInt(form.minQuantity || '0'), companyId };
    try {
      if (editId) { await inventoryApi.update(editId, data); toast.success('Yangilandi'); }
      else { await inventoryApi.create(data); toast.success('Yaratildi'); }
      setShowModal(false); load();
    } catch (err: any) { toast.error(err.response?.data?.message || 'Xatolik'); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("O'chirishni tasdiqlaysizmi?")) return;
    try { await inventoryApi.delete(id); toast.success("O'chirildi"); load(); } catch { toast.error('Xatolik'); }
  };

  const isLowStock = (item: any) => item.minQuantity && item.quantity <= item.minQuantity;

  return (
    <>
      <Navbar title="Ombor" />
      <div className="page-content">
        <div className="page-header">
          <h1>Ombor</h1>
          <div className="page-actions">
            <button className="btn btn-primary" onClick={openCreate}><Plus size={18} /> Yangi</button>
          </div>
        </div>

        <div className="glass-card" style={{ padding: 0 }}>
          {loading ? (
            <div className="loading-center"><div className="spinner" /></div>
          ) : items.length === 0 ? (
            <div className="empty-state"><Package size={48} /><h3>Mahsulot topilmadi</h3></div>
          ) : (
            <table className="glass-table">
              <thead>
                <tr><th>Nomi</th><th>SKU</th><th>Miqdor</th><th>Birlik</th><th>Narxi</th><th>Holat</th><th></th></tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id}>
                    <td style={{ fontWeight: 600 }}>{i.name}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontSize: 13 }}>{i.sku || '—'}</td>
                    <td className="text-mono" style={{ fontWeight: 600 }}>{i.quantity}</td>
                    <td>{i.unit}</td>
                    <td className="text-mono">{i.price ? new Intl.NumberFormat('uz-UZ').format(i.price) + ' UZS' : '—'}</td>
                    <td>
                      {isLowStock(i)
                        ? <span className="badge badge-danger" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><AlertTriangle size={12} /> Kam</span>
                        : <span className="badge badge-success">Yetarli</span>}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="navbar-btn" style={{ width: 32, height: 32, borderRadius: 8 }} onClick={() => openEdit(i)}><Edit size={14} /></button>
                        <button className="navbar-btn" style={{ width: 32, height: 32, borderRadius: 8 }} onClick={() => handleDelete(i.id)}><Trash2 size={14} /></button>
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
                <h2>{editId ? 'Tahrirlash' : 'Yangi mahsulot'}</h2>
                <button className="modal-close" onClick={() => setShowModal(false)}><X size={18} /></button>
              </div>
              <form onSubmit={handleSubmit}>
                <div className="form-group"><label>Nomi</label><input className="form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div className="form-group"><label>SKU</label><input className="form-input" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} /></div>
                  <div className="form-group"><label>Birlik</label>
                    <select className="form-select" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
                      <option value="dona">Dona</option><option value="kg">KG</option><option value="metr">Metr</option><option value="litr">Litr</option><option value="komplekt">Komplekt</option>
                    </select>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                  <div className="form-group"><label>Miqdor</label><input className="form-input" type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></div>
                  <div className="form-group"><label>Narxi (UZS)</label><input className="form-input" type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></div>
                  <div className="form-group"><label>Min. miqdor</label><input className="form-input" type="number" value={form.minQuantity} onChange={(e) => setForm({ ...form, minQuantity: e.target.value })} /></div>
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
