import { Bell, Sun, Moon, Search } from 'lucide-react';
import { useState } from 'react';

interface NavbarProps {
  title: string;
}

export default function Navbar({ title }: NavbarProps) {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
  };

  return (
    <header className="navbar">
      <div className="navbar-left">
        <h1 className="navbar-title">{title}</h1>
      </div>
      <div className="navbar-right">
        <div className="search-box">
          <Search className="search-icon" size={16} />
          <input className="form-input" placeholder="Qidirish..." style={{ paddingLeft: 36, width: 220, fontSize: 13 }} />
        </div>
        <button className="navbar-btn" onClick={toggleTheme}>
          {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
        </button>
        <button className="navbar-btn">
          <Bell size={18} />
          <span className="notification-dot" />
        </button>
      </div>
    </header>
  );
}
