import { useEffect, useState } from 'react';
import Navbar from '../../components/layout/Navbar';
import { useAuth } from '../../context/AuthContext';
import { transactionsApi, companiesApi } from '../../api';
import {
  DollarSign, TrendingUp, TrendingDown, Wallet,
  Package, Users
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';

export default function DashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<any>(null);
  const [balance, setBalance] = useState<any>(null);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const companyId = user?.companyId;

  useEffect(() => {
    if (!companyId) { setLoading(false); return; }
    Promise.allSettled([
      transactionsApi.getBalance(companyId),
      transactionsApi.getSummary(companyId, { groupBy: 'monthly' }),
      companiesApi.getDashboard(companyId),
    ]).then(([balRes, sumRes, dashRes]) => {
      if (balRes.status === 'fulfilled') setBalance(balRes.value.data);
      if (sumRes.status === 'fulfilled') setSummary(sumRes.value.data);
      if (dashRes.status === 'fulfilled') setStats(dashRes.value.data);
    }).finally(() => setLoading(false));
  }, [companyId]);

  const formatMoney = (v: number) => {
    if (!v) return '0';
    return new Intl.NumberFormat('uz-UZ').format(Math.round(v));
  };

  const statCards = [
    {
      icon: Wallet, label: 'Balans', value: formatMoney(balance?.balance || 0),
      color: '#4361EE', bg: 'rgba(67,97,238,0.1)',
      change: balance?.balance > 0 ? '+' : '', positive: (balance?.balance || 0) >= 0
    },
    {
      icon: TrendingUp, label: 'Daromad', value: formatMoney(balance?.totalIncome || 0),
      color: '#10B981', bg: 'rgba(16,185,129,0.1)',
      change: '+', positive: true
    },
    {
      icon: TrendingDown, label: 'Xarajat', value: formatMoney(balance?.totalExpense || 0),
      color: '#EF4444', bg: 'rgba(239,68,68,0.08)',
      change: '-', positive: false
    },
    {
      icon: DollarSign, label: 'Tranzaksiyalar', value: stats?.transactionCount || '0',
      color: '#06B6D4', bg: 'rgba(6,182,212,0.1)',
      change: '', positive: true
    },
  ];

  const chartData = summary?.map((s: any) => ({
    name: s.period,
    income: parseFloat(s.totalIncome || 0),
    expense: parseFloat(s.totalExpense || 0),
  })) || [];

  return (
    <>
      <Navbar title="Dashboard" />
      <div className="page-content">
        {!companyId ? (
          <div className="glass-card empty-state">
            <h3>Kompaniya tanlanmagan</h3>
            <p>Dashboard ko'rish uchun kompaniyangizga biriktirilgan bo'lishingiz kerak</p>
          </div>
        ) : loading ? (
          <div className="loading-center"><div className="spinner" /></div>
        ) : (
          <>
            {/* Stats */}
            <div className="stats-grid">
              {statCards.map((card, i) => (
                <div key={i} className="glass-card stat-card">
                  <div className="stat-icon" style={{ background: card.bg, color: card.color }}>
                    <card.icon size={22} />
                  </div>
                  <div>
                    <div className="stat-value">{card.value}</div>
                    <div className="stat-label">{card.label}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Charts */}
            <div className="content-grid">
              <div className="glass-card">
                <h3 style={{ marginBottom: 20 }}>Moliyaviy ko'rsatkichlar</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={chartData}>
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
                    <XAxis dataKey="name" stroke="#94A3B8" fontSize={12} />
                    <YAxis stroke="#94A3B8" fontSize={12} />
                    <Tooltip
                      contentStyle={{ background: 'var(--card-bg)', border: '1px solid var(--divider)', borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.12)' }}
                      labelStyle={{ color: 'var(--text-primary)', fontWeight: 600 }}
                    />
                    <Area type="monotone" dataKey="income" stroke="#10B981" fillOpacity={1} fill="url(#incomeGrad)" name="Daromad" />
                    <Area type="monotone" dataKey="expense" stroke="#EF4444" fillOpacity={1} fill="url(#expenseGrad)" name="Xarajat" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div className="glass-card">
                <h3 style={{ marginBottom: 20 }}>Umumiy ma'lumot</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Package size={18} style={{ color: '#FF6427' }} />
                      <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Mahsulotlar</span>
                    </div>
                    <span className="text-mono" style={{ fontWeight: 600 }}>{stats?.inventoryCount || 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Users size={18} style={{ color: '#06B6D4' }} />
                      <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Kontragentlar</span>
                    </div>
                    <span className="text-mono" style={{ fontWeight: 600 }}>{stats?.counterpartyCount || 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <TrendingUp size={18} style={{ color: '#10B981' }} />
                      <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Oylik daromad</span>
                    </div>
                    <span className="text-mono text-success" style={{ fontWeight: 600 }}>
                      {formatMoney(stats?.monthlyIncome || 0)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <TrendingDown size={18} style={{ color: '#EF4444' }} />
                      <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Oylik xarajat</span>
                    </div>
                    <span className="text-mono text-danger" style={{ fontWeight: 600 }}>
                      {formatMoney(stats?.monthlyExpense || 0)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
