import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import DashboardPage from './pages/DashboardPage.js';
import SiteConfigPage from './pages/SiteConfigPage.js';
import ColumnMappingPage from './pages/ColumnMappingPage.js';

export default function App() {
  return (
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
  );
}
