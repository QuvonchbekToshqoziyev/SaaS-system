import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { UserPlus } from 'lucide-react';

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    email: '', password: '', firstName: '', lastName: '', phone: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await register(form);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.message || "Ro'yxatdan o'tishda xatolik");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <div className="login-logo">AH</div>
          <h1>Ro'yxatdan o'tish</h1>
          <p className="login-subtitle">Yangi hisob yarating</p>
        </div>
        {error && <div className="error-msg">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="form-group">
              <label>Ism</label>
              <input className="form-input" name="firstName" placeholder="Ism" value={form.firstName} onChange={handleChange} required />
            </div>
            <div className="form-group">
              <label>Familiya</label>
              <input className="form-input" name="lastName" placeholder="Familiya" value={form.lastName} onChange={handleChange} required />
            </div>
          </div>
          <div className="form-group">
            <label>Email</label>
            <input className="form-input" type="email" name="email" placeholder="email@example.com" value={form.email} onChange={handleChange} required />
          </div>
          <div className="form-group">
            <label>Telefon</label>
            <input className="form-input" name="phone" placeholder="+998 90 123 45 67" value={form.phone} onChange={handleChange} />
          </div>
          <div className="form-group">
            <label>Parol</label>
            <input className="form-input" type="password" name="password" placeholder="Kamida 6 ta belgi" value={form.password} onChange={handleChange} required minLength={6} />
          </div>
          <button className="btn btn-primary" type="submit" disabled={loading}>
            <UserPlus size={18} />
            {loading ? 'Yaratilmoqda...' : "Ro'yxatdan o'tish"}
          </button>
        </form>
        <div className="login-footer">
          Hisobingiz bormi? <Link to="/login">Kirish</Link>
        </div>
      </div>
    </div>
  );
}
