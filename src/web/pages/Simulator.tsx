import { useMemo, useState } from 'react';
import { useData, derive } from '../store';
import { suggestedPrice, whereUsed, withPriceChanges } from '../../shared/domain';
import { CoefBadge, Money, PageHead, fmtNum } from '../ui';

const SCENARIOS: { label: string; changes: (find: (s: string) => string | undefined) => Record<string, number> }[] = [
  { label: 'Crise du beurre (+25 %)', changes: (f) => Object.fromEntries([f('Beurre doux'), f('tourage')].filter(Boolean).map((id) => [id!, 25])) },
  { label: 'Cacao en flambée (+40 %)', changes: (f) => Object.fromEntries([f('Chocolat'), f('Bâtons')].filter(Boolean).map((id) => [id!, 40])) },
  { label: 'Farine +15 %', changes: (f) => Object.fromEntries([f('T45'), f('T55')].filter(Boolean).map((id) => [id!, 15])) },
];

export default function Simulator() {
  const { catalog, derived } = useData();
  const [changes, setChanges] = useState<Record<string, number>>({});
  const target = catalog.bakery.targetCoef;
  const find = (s: string) => catalog.ingredients.find((i) => i.name.includes(s))?.id;

  // Ingrédients réellement utilisés par des produits, les plus coûteux d'abord
  const ingredients = useMemo(() => catalog.ingredients
    .filter((i) => (i.priceCents ?? 0) > 0 && whereUsed(i.id, catalog).productIds.length)
    .sort((a, b) => (b.priceCents ?? 0) - (a.priceCents ?? 0)), [catalog]);

  const simulated = useMemo(() => derive(withPriceChanges(catalog, changes)), [catalog, changes]);
  const rows = catalog.products.filter((p) => p.active).map((p) => {
    const before = derived.econ.get(p.id)!, after = simulated.econ.get(p.id)!;
    return { p, before, after, deltaMargin: after.marginCents - before.marginCents };
  }).sort((a, b) => a.deltaMargin - b.deltaMargin);
  const lost = rows.reduce((s, r) => s + r.deltaMargin, 0);
  const newlyBelow = rows.filter((r) => r.after.belowTarget && !r.before.belowTarget).length;
  const active = Object.values(changes).some((v) => v !== 0);

  return (
    <>
      <PageHead kicker="Et si…" title="Simulateur de prix">
        Faites varier le prix des matières premières et voyez immédiatement l’effet sur chaque marge. Rien n’est enregistré.
      </PageHead>

      <div className="scenarios">
        {SCENARIOS.map((s) => <button key={s.label} className="chip-btn" onClick={() => setChanges(s.changes(find))}>{s.label}</button>)}
        {active && <button className="chip-btn ghost" onClick={() => setChanges({})}>Réinitialiser</button>}
      </div>

      <div className="sim">
        <section className="card sliders">
          {ingredients.map((i) => {
            const v = changes[i.id] ?? 0;
            return (
              <div key={i.id} className={`slider${v ? ' moved' : ''}`}>
                <div className="slider-head"><span>{i.name}</span><b className="num">{v > 0 ? '+' : ''}{v} %</b></div>
                <input type="range" min={-30} max={60} step={5} value={v} onChange={(e) => setChanges({ ...changes, [i.id]: Number(e.target.value) })} aria-label={`Variation ${i.name}`} />
                <small className="muted"><Money cents={i.priceCents} /> → <Money cents={(i.priceCents ?? 0) * (1 + v / 100)} /></small>
              </div>
            );
          })}
        </section>

        <section className="sim-results">
          <div className="kpis compact">
            <div className={`kpi${lost < 0 ? ' alert' : ''}`}><span>Marge par panier type</span><strong><Money cents={lost} /></strong><small>une pièce de chaque produit</small></div>
            <div className={`kpi${newlyBelow ? ' alert' : ''}`}><span>Passent sous l’objectif</span><strong className="num">{newlyBelow}</strong><small>coefficient &lt; ×{fmtNum(target)}</small></div>
          </div>
          <div className="card flush">
            <table className="table">
              <thead><tr><th>Produit</th><th className="r">Coût avant</th><th className="r">Coût après</th><th className="r">Marge</th><th className="r">Coef.</th><th className="r">Nouveau prix conseillé</th></tr></thead>
              <tbody>
                {rows.map(({ p, before, after, deltaMargin }) => (
                  <tr key={p.id} className={deltaMargin < 0 ? 'hit' : ''}>
                    <td>{p.name}</td>
                    <td className="r"><Money cents={before.costCents} /></td>
                    <td className="r"><Money cents={after.costCents} /></td>
                    <td className="r">{deltaMargin ? <span className={deltaMargin < 0 ? 'neg' : 'pos'}><Money cents={deltaMargin} /></span> : <span className="muted">=</span>}</td>
                    <td className="r"><CoefBadge coef={after.coef} target={target} /></td>
                    <td className="r">{after.belowTarget ? <strong><Money cents={suggestedPrice(after.costCents, p.vatRate, target)} /></strong> : <span className="muted">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}
