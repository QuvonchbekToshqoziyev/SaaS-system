import { useState } from 'react';
import Navbar from '../../components/layout/Navbar';
import { useAuth } from '../../context/AuthContext';
import { reportsApi } from '../../api';
import { FileBarChart2, Download } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import toast from 'react-hot-toast';

const COLORS = ['#4361EE', '#06B6D4', '#FF6427', '#EF4444', '#7C3AED', '#10B981'];

export default function ReportsPage() {
  const { user } = useAuth();
  const [reportType, setReportType] = useState('income_expense');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [reportData, setReportData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const companyId = user?.companyId;

  const generateReport = async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const res = await reportsApi.generate(companyId, { type: reportType, dateFrom, dateTo });
      setReportData(res.data);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Hisobot yaratishda xatolik');
    } finally { setLoading(false); }
  };

  const downloadReport = async () => {
    if (!companyId) return;
    try {
      const res = await reportsApi.download(companyId, { type: reportType, dateFrom, dateTo, format: 'pdf' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `hisobot_${reportType}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch { toast.error('Yuklab olishda xatolik'); }
  };

  const reports = [
    { key: 'income_expense', label: 'Daromad va Xarajat' },
    { key: 'balance', label: 'Balans hisoboti' },
    { key: 'cashflow', label: "Pul oqimi" },
    { key: 'counterparty_summary', label: 'Kontragentlar xulosasi' },
    { key: 'inventory_valuation', label: 'Ombor baholash' },
  ];

  // Sample chart data for demo
  const sampleChartData = [
    { name: 'Yan', income: 45000000, expense: 32000000 },
    { name: 'Fev', income: 52000000, expense: 38000000 },
    { name: 'Mar', income: 48000000, expense: 41000000 },
    { name: 'Apr', income: 61000000, expense: 35000000 },
    { name: 'May', income: 55000000, expense: 42000000 },
    { name: 'Iyun', income: 67000000, expense: 39000000 },
  ];

  const samplePieData = [
    { name: 'Sotish', value: 45 },
    { name: 'Xizmatlar', value: 25 },
    { name: 'Mahsulot', value: 20 },
    { name: 'Boshqa', value: 10 },
  ];

  return (
    <>
      <Navbar title="Hisobotlar" />
      <div className="page-content">
        <div className="page-header">
          <h1>Hisobotlar</h1>
        </div>

        {/* Report Controls */}
        <div className="glass-card" style={{ padding: 24, marginBottom: 24 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end' }}>
            <div className="form-group" style={{ marginBottom: 0, flex: '1 1 250px' }}>
              <label>Hisobot turi</label>
              <select className="form-select" value={reportType} onChange={(e) => setReportType(e.target.value)}>
                {reports.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0, flex: '0 1 180px' }}>
              <label>Boshlanish</label>
              <input className="form-input" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom: 0, flex: '0 1 180px' }}>
              <label>Tugash</label>
              <input className="form-input" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" onClick={generateReport} disabled={loading}>
                <FileBarChart2 size={18} /> {loading ? 'Yuklanmoqda...' : 'Yaratish'}
              </button>
              <button className="btn btn-secondary" onClick={downloadReport}>
                <Download size={18} /> Yuklab olish
              </button>
            </div>
          </div>
        </div>

        {/* Report type selector pills */}
        <div className="filter-pills" style={{ marginBottom: 24 }}>
          {reports.map((r) => (
            <button key={r.key} className={`filter-pill ${reportType === r.key ? 'active' : ''}`} onClick={() => setReportType(r.key)}>
              {r.label}
            </button>
          ))}
        </div>

        {/* Charts */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24 }}>
          <div className="glass-card" style={{ padding: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 24 }}>Daromad va Xarajat Grafigi</h3>
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart data={reportData?.chartData || sampleChartData}>
                <defs>
                  <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#EF4444" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#EF4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--divider)" />
                <XAxis dataKey="name" tick={{ fill: '#94A3B8', fontSize: 12 }} />
                <YAxis tick={{ fill: '#94A3B8', fontSize: 12 }} tickFormatter={(v) => (v / 1000000).toFixed(0) + 'M'} />
                <Tooltip contentStyle={{ background: 'var(--card-bg)', border: '1px solid var(--divider)', borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.12)' }} formatter={(v: any) => new Intl.NumberFormat('uz-UZ').format(Number(v)) + ' UZS'} />
                <Area type="monotone" dataKey="income" stroke="#10B981" fill="url(#incomeGrad)" strokeWidth={2} name="Daromad" />
                <Area type="monotone" dataKey="expense" stroke="#EF4444" fill="url(#expenseGrad)" strokeWidth={2} name="Xarajat" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="glass-card" style={{ padding: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 24 }}>Kategoriya bo'yicha</h3>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={reportData?.pieData || samplePieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} innerRadius={50} paddingAngle={4}>
                  {(reportData?.pieData || samplePieData).map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: 'var(--card-bg)', border: '1px solid var(--divider)', borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.12)' }} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
              {(reportData?.pieData || samplePieData).map((d: any, i: number) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: COLORS[i % COLORS.length] }} />
                  <span style={{ color: 'var(--text-secondary)' }}>{d.name} ({d.value}%)</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Summary table if data */}
        {reportData?.summary && (
          <div className="glass-card" style={{ padding: 0, marginTop: 24 }}>
            <table className="glass-table">
              <thead>
                <tr><th>Ko'rsatkich</th><th>Qiymati</th></tr>
              </thead>
              <tbody>
                {Object.entries(reportData.summary).map(([key, value]: any) => (
                  <tr key={key}><td>{key}</td><td className="text-mono" style={{ fontWeight: 600 }}>{typeof value === 'number' ? new Intl.NumberFormat('uz-UZ').format(value) : value}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
