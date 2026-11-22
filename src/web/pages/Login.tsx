import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { useStore } from '../store';
import type { Role } from '../../shared/types';

const ROLES: { role: Role; title: string; text: string }[] = [
  { role: 'patron', title: 'Patron', text: 'Marges, prix de vente, simulations de hausse des matières premières.' },
  { role: 'chef', title: 'Chef pâtissier', text: 'Fiches techniques, recettes imbriquées, fiches de pesée.' },
  { role: 'vendeur', title: 'Vendeuse', text: 'Produits, allergènes et étiquettes. Aucun coût affiché.' },
];

export default function Login() {
  const { refreshMe } = useStore();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key); setError(null);
    try { await fn(); await refreshMe(); } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  };
  const submit = (e: FormEvent) => { e.preventDefault(); void run('login', () => api.post('/auth/login', { email, password })); };

  return (
    <div className="login">
      <section className="login-hero">
        <div className="brand big">
          <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 22c0-7 5-12 11-12s11 5 11 12H5z" fill="currentColor"/><path d="M10 16l2.5 5M16 14v7M22 16l-2.5 5" stroke="var(--side)" strokeWidth="1.8" strokeLinecap="round"/></svg>
          <strong>Fournil</strong>
        </div>
        <h1>Le prix juste de chaque viennoiserie, <em>au centime près.</em></h1>
        <p>Fiches techniques, coût de revient, marges et allergènes pour les boulangeries-pâtisseries.
          Le beurre augmente ? Fournil vous dit tout de suite quels produits ne sont plus rentables.</p>
        <ul className="facts">
          <li><b>Recettes imbriquées</b> : le feuilletage entre dans le mille-feuille, le coût suit.</li>
          <li><b>14 allergènes INCO</b> propagés jusqu'à l'étiquette.</li>
          <li><b>Trois rôles</b> : chacun ne voit que ce qui le concerne.</li>
        </ul>
      </section>

      <section className="login-panel">
        <h2>Essayer la démo</h2>
        <p className="muted">Une boulangerie fictive est créée rien que pour vous, avec 8 produits et 17 recettes. Choisissez un rôle :</p>
        <div className="role-cards">
          {ROLES.map((r) => (
            <button key={r.role} className="role-card" disabled={!!busy} onClick={() => run(r.role, () => api.post('/auth/demo', { role: r.role }))}>
              <strong>{r.title}</strong><span>{r.text}</span>
              <em>{busy === r.role ? 'Préparation du fournil…' : 'Entrer →'}</em>
            </button>
          ))}
        </div>

        <div className="divider"><span>ou</span></div>

        <form onSubmit={submit} className="login-form">
          <label className="field"><span>Email</span><input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
          <label className="field"><span>Mot de passe</span><input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
          <button className="btn" disabled={!!busy}>{busy === 'login' ? 'Connexion…' : 'Se connecter'}</button>
        </form>
        {error && <p className="error" role="alert">{error}</p>}
        <p className="credit">Conçu par <a href="https://as9ardth0r.github.io/portfolio/">Joël Broutin</a>, ancien pâtissier devenu développeur.</p>
      </section>
    </div>
  );
}
