import { useEffect, type ReactNode } from 'react';
import { allergenLabel } from '../shared/allergens';
import { euros } from '../shared/domain';

export const Money = ({ cents, digits = 2 }: { cents: number | undefined; digits?: number }) =>
  <span className="num">{cents === undefined || !Number.isFinite(cents) ? '—' : euros(cents, digits)}</span>;

export const fmtNum = (n: number, d = 1) => n.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });

export function CoefBadge({ coef, target }: { coef: number; target: number }) {
  if (!Number.isFinite(coef)) return <span className="badge muted">—</span>;
  const tone = coef >= target ? 'ok' : coef >= target * 0.85 ? 'warn' : 'bad';
  return <span className={`badge ${tone}`} title={`Objectif : ×${fmtNum(target)}`}>×{fmtNum(coef, 2)}</span>;
}

export function Allergens({ codes, empty = 'Aucun' }: { codes: Iterable<string>; empty?: string }) {
  const list = [...codes];
  if (!list.length) return <span className="muted small">{empty}</span>;
  return <span className="chips">{list.map((c) => <span key={c} className="chip">{allergenLabel(c)}</span>)}</span>;
}

export function PageHead({ title, kicker, actions, children }: { title: string; kicker?: string; actions?: ReactNode; children?: ReactNode }) {
  return (
    <header className="page-head">
      <div>
        {kicker && <p className="kicker">{kicker}</p>}
        <h1>{title}</h1>
        {children && <p className="lede">{children}</p>}
      </div>
      {actions && <div className="head-actions">{actions}</div>}
    </header>
  );
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon" onClick={onClose} aria-label="Fermer">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children, hint, className = '' }: { label: string; children: ReactNode; hint?: string; className?: string }) {
  return <label className={`field ${className}`}><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

/** Petite courbe SVG pour l'historique des prix. */
export function Sparkline({ points, width = 220, height = 56 }: { points: number[]; width?: number; height?: number }) {
  if (points.length < 2) return <span className="muted small">Pas d'historique</span>;
  const min = Math.min(...points), max = Math.max(...points), span = max - min || 1;
  const xy = points.map((p, i) => [(i / (points.length - 1)) * (width - 8) + 4, height - 6 - ((p - min) / span) * (height - 12)] as const);
  const d = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const last = xy[xy.length - 1]!;
  return (
    <svg className="spark" viewBox={`0 0 ${width} ${height}`} width={width} height={height} aria-hidden="true">
      <path d={`${d} L${last[0]} ${height} L4 ${height} Z`} className="spark-fill" />
      <path d={d} className="spark-line" />
      <circle cx={last[0]} cy={last[1]} r="3.5" className="spark-dot" />
    </svg>
  );
}

export function Toast({ message }: { message: string | null }) {
  return <div className={`toast${message ? ' show' : ''}`} role="status" aria-live="polite">{message}</div>;
}

export const Empty = ({ children }: { children: ReactNode }) => <div className="empty">{children}</div>;
