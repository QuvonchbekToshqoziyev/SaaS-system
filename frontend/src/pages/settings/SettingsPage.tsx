import { useState } from 'react';
import Navbar from '../../components/layout/Navbar';
import { useAuth } from '../../context/AuthContext';
import { usersApi } from '../../api';
import { Save, User, Bell, Shield, Palette } from 'lucide-react';
import toast from 'react-hot-toast';

export default function SettingsPage() {
  const { user, fetchProfile } = useAuth();
  const [tab, setTab] = useState('profile');
  const [form, setForm] = useState({
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    email: user?.email || '',
    phone: user?.phone || '',
  });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [saving, setSaving] = useState(false);

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await usersApi.update(user!.id, form);
      await fetchProfile();
      toast.success('Profil yangilandi');
    } catch (err: any) { toast.error(err.response?.data?.message || 'Xatolik'); }
    finally { setSaving(false); }
  };

  const handlePasswordSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      return toast.error('Parollar mos kelmaydi');
    }
    setSaving(true);
    try {
      await usersApi.update(user!.id, { password: passwordForm.newPassword });
      toast.success('Parol yangilandi');
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err: any) { toast.error(err.response?.data?.message || 'Xatolik'); }
    finally { setSaving(false); }
  };

  const tabs = [
    { key: 'profile', label: 'Profil', icon: User },
    { key: 'security', label: 'Xavfsizlik', icon: Shield },
    { key: 'notifications', label: 'Bildirishnomalar', icon: Bell },
    { key: 'appearance', label: "Ko'rinish", icon: Palette },
  ];

  return (
    <>
      <Navbar title="Sozlamalar" />
      <div className="page-content">
        <div className="page-header">
          <h1>Sozlamalar</h1>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 24 }}>
          {/* Settings nav */}
          <div className="glass-card" style={{ padding: 8 }}>
            {tabs.map((t) => {
              const Icon = t.icon;
              return (
                <button key={t.key}
                  onClick={() => setTab(t.key)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '12px 16px',
                    background: tab === t.key ? 'var(--glass-bg)' : 'transparent', border: 'none',
                    color: tab === t.key ? 'var(--brand-primary)' : 'var(--text-secondary)', cursor: 'pointer',
                    borderRadius: 8, fontSize: 14, fontWeight: tab === t.key ? 600 : 400, transition: 'all 0.15s'
                  }}>
                  <Icon size={18} /> {t.label}
                </button>
              );
            })}
          </div>

          {/* Tab content */}
          <div className="glass-card" style={{ padding: 32 }}>
            {tab === 'profile' && (
              <>
                <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 24 }}>Profil ma'lumotlari</h2>
                <form onSubmit={handleProfileSave}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div className="form-group"><label>Ism</label><input className="form-input" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></div>
                    <div className="form-group"><label>Familiya</label><input className="form-input" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></div>
                  </div>
                  <div className="form-group"><label>Email</label><input className="form-input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                  <div className="form-group"><label>Telefon</label><input className="form-input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                  <button className="btn btn-primary" type="submit" disabled={saving}>
                    <Save size={18} /> {saving ? 'Saqlanmoqda...' : 'Saqlash'}
                  </button>
                </form>
              </>
            )}

            {tab === 'security' && (
              <>
                <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 24 }}>Parolni o'zgartirish</h2>
                <form onSubmit={handlePasswordSave}>
                  <div className="form-group"><label>Hozirgi parol</label><input className="form-input" type="password" value={passwordForm.currentPassword} onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })} required /></div>
                  <div className="form-group"><label>Yangi parol</label><input className="form-input" type="password" value={passwordForm.newPassword} onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })} required minLength={6} /></div>
                  <div className="form-group"><label>Parolni tasdiqlang</label><input className="form-input" type="password" value={passwordForm.confirmPassword} onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })} required /></div>
                  <button className="btn btn-primary" type="submit" disabled={saving}>
                    <Save size={18} /> {saving ? 'Saqlanmoqda...' : "O'zgartirish"}
                  </button>
                </form>
              </>
            )}

            {tab === 'notifications' && (
              <>
                <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 24 }}>Bildirishnomalar</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {['Email bildirishnomalar', 'Push bildirishnomalar', 'Tranzaksiya bildirish', 'Chat xabarlari', 'Hisobot tayyor'].map((label) => (
                    <label key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--card-border)', cursor: 'pointer' }}>
                      <span style={{ fontSize: 14 }}>{label}</span>
                      <input type="checkbox" defaultChecked style={{ width: 20, height: 20, accentColor: 'var(--brand-primary)' }} />
                    </label>
                  ))}
                </div>
              </>
            )}

            {tab === 'appearance' && (
              <>
                <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 24 }}>Ko'rinish</h2>
                <div style={{ display: 'flex', gap: 16 }}>
                  {[{ key: 'light', label: 'Yorug\'', bg: '#F8FAFC' }, { key: 'dark', label: 'Qorong\'u', bg: '#0F172A' }].map((theme) => (
                    <button key={theme.key}
                      onClick={() => document.documentElement.setAttribute('data-theme', theme.key)}
                      style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 24, borderRadius: 8,
                        background: 'var(--bg-secondary)', border: '1px solid var(--card-border)', cursor: 'pointer',
                        color: 'var(--text-primary)', flex: 1
                      }}>
                      <div style={{ width: 80, height: 56, borderRadius: 8, background: theme.bg, border: '2px solid var(--card-border)' }} />
                      <span style={{ fontSize: 14 }}>{theme.label}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
