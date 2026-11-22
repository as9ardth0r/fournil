import { useEffect, useState } from 'react';
import { BrowserRouter, NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { StoreProvider, useStore } from './store';
import { api } from './api';
import { Toast } from './ui';
import type { Role } from '../shared/types';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Products from './pages/Products';
import Recipes from './pages/Recipes';
import Ingredients from './pages/Ingredients';
import Simulator from './pages/Simulator';
import AllergenMatrix from './pages/AllergenMatrix';
import Label from './pages/Label';

/** Notification globale, utilisable de n'importe où. */
export const notify = (message: string) => window.dispatchEvent(new CustomEvent('fournil:toast', { detail: message }));

const ROLE_LABEL: Record<Role, string> = { patron: 'Patron', chef: 'Chef pâtissier', vendeur: 'Vendeuse' };

function Shell() {
  const { me, catalog, can, refreshMe } = useStore();
  const navigate = useNavigate();
  const [menu, setMenu] = useState(false);
  if (!me || !catalog) return null;

  const switchRole = async (role: Role) => {
    await api.post('/auth/switch-role', { role });
    await refreshMe();
    navigate('/');
    notify(`Vous voyez maintenant Fournil comme : ${ROLE_LABEL[role]}`);
  };
  const logout = async () => { await api.post('/auth/logout'); await refreshMe(); };

  const links = [
    { to: '/', label: 'Tableau de bord', icon: '◧', show: true },
    { to: '/produits', label: 'Produits', icon: '◍', show: true },
    { to: '/recettes', label: 'Recettes', icon: '☰', show: can.editCatalog },
    { to: '/ingredients', label: 'Ingrédients', icon: '◫', show: can.editCatalog },
    { to: '/simulateur', label: 'Simulateur', icon: '⇅', show: can.seeCosts },
    { to: '/allergenes', label: 'Classeur allergènes', icon: '⚠', show: true },
  ];

  return (
    <div className="shell">
      <aside className={`sidebar${menu ? ' open' : ''}`}>
        <div className="brand">
          <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 22c0-7 5-12 11-12s11 5 11 12H5z" fill="currentColor"/><path d="M10 16l2.5 5M16 14v7M22 16l-2.5 5" stroke="var(--side)" strokeWidth="1.8" strokeLinecap="round"/></svg>
          <div><strong>Fournil</strong><span>{catalog.bakery.name}</span></div>
        </div>
        <nav onClick={() => setMenu(false)}>
          {links.filter((l) => l.show).map((l) => (
            <NavLink key={l.to} to={l.to} end={l.to === '/'}><span className="nav-icon">{l.icon}</span>{l.label}</NavLink>
          ))}
        </nav>
        <div className="side-foot">
          {me.isDemo && (
            <div className="role-switch">
              <span>Voir en tant que</span>
              <div className="seg">
                {(['patron', 'chef', 'vendeur'] as Role[]).map((r) => (
                  <button key={r} className={r === me.role ? 'on' : ''} onClick={() => r !== me.role && switchRole(r)}>{ROLE_LABEL[r].split(' ')[0]}</button>
                ))}
              </div>
            </div>
          )}
          <div className="who">
            <div className="avatar">{me.name.split(' ').map((p) => p[0]).join('')}</div>
            <div><strong>{me.name}</strong><span>{ROLE_LABEL[me.role]}</span></div>
            <button className="icon" onClick={logout} title="Se déconnecter" aria-label="Se déconnecter">⏻</button>
          </div>
        </div>
      </aside>
      <button className="burger" onClick={() => setMenu(!menu)} aria-label="Menu">☰</button>
      <main className="content">
        {me.isDemo && <div className="demo-banner">Démonstration : données fictives, rien que pour vous, effacées sous 24 h. Modifiez tout ce que vous voulez.</div>}
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/produits" element={<Products />} />
          <Route path="/recettes" element={can.editCatalog ? <Recipes /> : <Navigate to="/" />} />
          <Route path="/recettes/:id" element={can.editCatalog ? <Recipes /> : <Navigate to="/" />} />
          <Route path="/ingredients" element={can.editCatalog ? <Ingredients /> : <Navigate to="/" />} />
          <Route path="/simulateur" element={can.seeCosts ? <Simulator /> : <Navigate to="/" />} />
          <Route path="/allergenes" element={<AllergenMatrix />} />
          <Route path="/etiquette/:id" element={<Label />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
    </div>
  );
}

function Gate() {
  const { me, loading } = useStore();
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const on = (e: Event) => { setToast((e as CustomEvent<string>).detail); clearTimeout(t); t = setTimeout(() => setToast(null), 2800); };
    window.addEventListener('fournil:toast', on);
    return () => window.removeEventListener('fournil:toast', on);
  }, []);
  if (loading) return <div className="splash"><div className="loader" /></div>;
  return <>{me ? <Shell /> : <Login />}<Toast message={toast} /></>;
}

export default function App() {
  return <BrowserRouter><StoreProvider><Gate /></StoreProvider></BrowserRouter>;
}
