import { useEffect, useState } from 'react';
import Navbar from '../../components/layout/Navbar';
import { auditApi } from '../../api';
import { Clock, Search } from 'lucide-react';
import toast from 'react-hot-toast';

export default function AuditPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    auditApi.getAll()
      .then((res) => setLogs(Array.isArray(res.data) ? res.data : res.data.data || []))
      .catch(() => toast.error('Audit loglarni yuklashda xatolik'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = filter
    ? logs.filter((l) => l.action?.toLowerCase().includes(filter.toLowerCase()) || l.entity?.toLowerCase().includes(filter.toLowerCase()) || l.user?.firstName?.toLowerCase().includes(filter.toLowerCase()))
    : logs;

  const actionColor = (action: string) => {
    if (action?.includes('create') || action?.includes('add')) return 'success';
    if (action?.includes('delete') || action?.includes('remove')) return 'danger';
    if (action?.includes('update') || action?.includes('edit')) return 'warning';
    return 'info';
  };

  return (
    <>
      <Navbar title="Audit" />
      <div className="page-content">
        <div className="page-header">
          <h1>Audit Log</h1>
        </div>

        <div className="glass-card" style={{ padding: 16, marginBottom: 24 }}>
          <div style={{ position: 'relative' }}>
            <Search size={18} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input className="form-input" style={{ paddingLeft: 42 }} placeholder="Qidirish: amal, entity, foydalanuvchi..." value={filter} onChange={(e) => setFilter(e.target.value)} />
          </div>
        </div>

        <div className="glass-card" style={{ padding: 0 }}>
          {loading ? (
            <div className="loading-center"><div className="spinner" /></div>
          ) : filtered.length === 0 ? (
            <div className="empty-state"><Clock size={48} /><h3>Log topilmadi</h3></div>
          ) : (
            <table className="glass-table">
              <thead>
                <tr><th>Vaqt</th><th>Foydalanuvchi</th><th>Amal</th><th>Entity</th><th>Tafsilotlar</th></tr>
              </thead>
              <tbody>
                {filtered.map((l) => (
                  <tr key={l.id}>
                    <td style={{ fontSize: 13, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {new Date(l.createdAt).toLocaleString('uz-UZ')}
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--glass-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, border: '1px solid var(--glass-border)' }}>
                          {l.user?.firstName?.[0] || '?'}
                        </div>
                        <span style={{ fontSize: 13 }}>{l.user?.firstName} {l.user?.lastName}</span>
                      </div>
                    </td>
                    <td><span className={`badge badge-${actionColor(l.action)}`}>{l.action}</span></td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)' }}>{l.entity}</td>
                    <td style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, color: 'var(--text-muted)' }}>
                      {l.details ? (typeof l.details === 'string' ? l.details : JSON.stringify(l.details)) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
