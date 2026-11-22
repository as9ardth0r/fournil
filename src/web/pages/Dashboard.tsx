import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../store';
import { api } from '../api';
import { explode, suggestedPrice } from '../../shared/domain';
import { Allergens, CoefBadge, Money, PageHead, Sparkline, fmtNum } from '../ui';

export default function Dashboard() {
  const { me, can } = useData();
  return can.seeCosts ? <ManagerDashboard /> : <ShopDashboard name={me.name.split(' ')[0]!} />;
}

function ManagerDashboard() {
  const { catalog, derived, me } = useData();
  const target = catalog.bakery.targetCoef;
  const active = catalog.products.filter((p) => p.active);
  const rows = active.map((p) => ({ p, e: derived.econ.get(p.id)! })).sort((a, b) => a.e.coef - b.e.coef);
  const below = rows.filter((r) => r.e.belowTarget);
  const avgCoef = rows.reduce((s, r) => s + r.e.coef, 0) / (rows.length || 1);
  const avgMargin = rows.reduce((s, r) => s + r.e.marginCents, 0) / (rows.length || 1);

  // Poids de chaque matière première dans le coût de la gamme (une pièce de chaque produit)
  const weights = useMemo(() => {
    const acc = new Map<string, number>();
    for (const p of active) {
      for (const [id, q] of explode(p.recipeId, p.portionQty, derived.idx)) {
        const price = derived.idx.ingredients.get(id)?.priceCents ?? 0;
        acc.set(id, (acc.get(id) ?? 0) + q * price);
      }
    }
    const total = [...acc.values()].reduce((s, v) => s + v, 0) || 1;
    return [...acc.entries()].map(([id, c]) => ({ id, name: derived.idx.ingredients.get(id)!.name, cents: c, share: c / total }))
      .sort((a, b) => b.cents - a.cents).slice(0, 6);
  }, [active, derived]);

  const [histories, setHistories] = useState<Record<string, number[]>>({});
  useEffect(() => {
    let alive = true;
    Promise.all(weights.slice(0, 3).map(async (w) => [w.id, (await api.get<{ priceCents: number }[]>(`/ingredients/${w.id}/history`)).map((h) => h.priceCents)] as const))
      .then((list) => alive && setHistories(Object.fromEntries(list)));
    return () => { alive = false; };
  }, [weights]);

  if (!active.length) {
    return (
      <>
        <PageHead kicker="Bienvenue" title={`Bonjour ${me.name.split(' ')[0]}`}>Votre fournil est prêt. Trois étapes pour connaître vos marges :</PageHead>
        <ol className="card onboarding">
          <li><Link to="/ingredients"><strong>Vos ingrédients</strong></Link> avec leur prix d’achat et leurs allergènes.</li>
          <li><Link to="/recettes"><strong>Vos fiches techniques</strong></Link> : recettes de base, puis assemblages.</li>
          <li><Link to="/produits"><strong>Vos produits</strong></Link> et leur prix de vente : Fournil calcule le reste.</li>
        </ol>
      </>
    );
  }

  return (
    <>
      <PageHead kicker={new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })} title={`Bonjour ${me.name.split(' ')[0]}`}>
        Voici où en sont vos marges aujourd'hui, avec les prix d'achat actuels.
      </PageHead>

      <div className="kpis">
        <div className="kpi"><span>Produits en vente</span><strong className="num">{active.length}</strong></div>
        <div className="kpi"><span>Coefficient moyen</span><strong className="num">×{fmtNum(avgCoef, 2)}</strong><small>objectif ×{fmtNum(target)}</small></div>
        <div className={`kpi${below.length ? ' alert' : ''}`}><span>Sous l'objectif</span><strong className="num">{below.length}</strong><small>{below.length ? 'à revoir' : 'tout va bien'}</small></div>
        <div className="kpi"><span>Marge moyenne / pièce</span><strong><Money cents={avgMargin} /></strong><small>HT, matière seule</small></div>
      </div>

      <div className="grid-2">
        <section className="card">
          <div className="card-head"><h2>À surveiller</h2><Link to="/produits">Tous les produits →</Link></div>
          <table className="table">
            <thead><tr><th>Produit</th><th className="r">Coût</th><th className="r">Prix TTC</th><th className="r">Coef.</th><th className="r">Prix conseillé</th></tr></thead>
            <tbody>
              {rows.slice(0, 5).map(({ p, e }) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td className="r"><Money cents={e.costCents} /></td>
                  <td className="r"><Money cents={p.priceCents} /></td>
                  <td className="r"><CoefBadge coef={e.coef} target={target} /></td>
                  <td className="r">{e.belowTarget ? <strong><Money cents={suggestedPrice(e.costCents, p.vatRate, target)} /></strong> : <span className="muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="card">
          <div className="card-head"><h2>Ce qui pèse dans vos coûts</h2><Link to="/simulateur">Simuler une hausse →</Link></div>
          <ul className="bars">
            {weights.map((w) => (
              <li key={w.id}>
                <span className="bar-label">{w.name}</span>
                <span className="bar"><i style={{ width: `${(w.share / weights[0]!.share) * 100}%` }} /></span>
                <span className="num bar-val">{fmtNum(w.share * 100, 0)} %</span>
              </li>
            ))}
          </ul>
          <p className="muted small">Part de chaque matière dans le coût d'une pièce de chaque produit de la gamme.</p>
        </section>
      </div>

      <section className="card">
        <div className="card-head"><h2>L'évolution de vos matières clés</h2><Link to="/ingredients">Ingrédients →</Link></div>
        <div className="trends">
          {weights.slice(0, 3).map((w) => {
            const h = histories[w.id] ?? [];
            const change = h.length > 1 ? ((h[h.length - 1]! - h[0]!) / h[0]!) * 100 : 0;
            return (
              <div key={w.id} className="trend">
                <div><strong>{w.name}</strong><span className={change > 0 ? 'up' : 'down'}>{change > 0 ? '+' : ''}{fmtNum(change, 0)} % sur un an</span></div>
                <Sparkline points={h} />
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}

function ShopDashboard({ name }: { name: string }) {
  const { catalog, derived } = useData();
  return (
    <>
      <PageHead kicker="Comptoir" title={`Bonjour ${name}`}>
        La vitrine du jour avec les allergènes de chaque produit. Un client demande ? La réponse est là.
      </PageHead>
      <div className="shop-grid">
        {catalog.products.filter((p) => p.active).map((p) => (
          <article key={p.id} className="card shop-card">
            <div className="shop-top"><h3>{p.name}</h3><strong><Money cents={p.priceCents} /></strong></div>
            <Allergens codes={derived.allergens(p.recipeId)} />
            <Link className="btn ghost small" to={`/etiquette/${p.id}`}>Étiquette</Link>
          </article>
        ))}
      </div>
    </>
  );
}
