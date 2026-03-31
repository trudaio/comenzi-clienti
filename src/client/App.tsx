import { useState } from 'react';
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import DashboardPage from './pages/DashboardPage.js';
import SiteConfigPage from './pages/SiteConfigPage.js';
import ColumnMappingPage from './pages/ColumnMappingPage.js';

const APP_PASSWORD = 'Limitless#123';
const AUTH_KEY = 'clientorders_auth';

function LoginGate({ children }: { children: React.ReactNode }) {
  const [authed, setAuthed] = useState(() => sessionStorage.getItem(AUTH_KEY) === 'true');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);

  if (authed) return <>{children}</>;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === APP_PASSWORD) {
      sessionStorage.setItem(AUTH_KEY, 'true');
      setAuthed(true);
    } else {
      setError(true);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <form onSubmit={handleSubmit} className="bg-gray-900 border border-gray-800 rounded-lg p-8 w-80">
        <h1 className="text-xl font-bold text-white mb-6 text-center">Clientorders</h1>
        <input
          type="password"
          value={password}
          onChange={(e) => { setPassword(e.target.value); setError(false); }}
          placeholder="Password"
          autoFocus
          className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 mb-3"
        />
        {error && <p className="text-red-400 text-xs mb-3">Incorrect password</p>}
        <button
          type="submit"
          className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded text-sm"
        >
          Login
        </button>
      </form>
    </div>
  );
}

export default function App() {
  return (
    <LoginGate>
      <BrowserRouter>
        <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
          {/* Nav */}
          <nav className="bg-gray-900 border-b border-gray-800 px-6 py-3 flex items-center gap-6">
            <span className="font-bold text-white text-lg">Clientorders</span>
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                isActive ? 'text-blue-400 text-sm' : 'text-gray-400 text-sm hover:text-white'
              }
            >
              Dashboard
            </NavLink>
            <NavLink
              to="/sites/new"
              className={({ isActive }) =>
                isActive ? 'text-blue-400 text-sm' : 'text-gray-400 text-sm hover:text-white'
              }
            >
              Add Site
            </NavLink>
          </nav>

          {/* Content */}
          <main className="flex-1 p-6">
            <Routes>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/sites/new" element={<SiteConfigPage />} />
              <Route path="/sites/:id/edit" element={<SiteConfigPage />} />
              <Route path="/sites/:id/mapping" element={<ColumnMappingPage />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </LoginGate>
  );
}
