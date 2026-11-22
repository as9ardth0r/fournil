import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useData, derive } from '../store';
import { api } from '../api';
import { notify } from '../App';
import { explode, findCycle, toBaseQty, UnitError, usableYield } from '../../shared/domain';
import type { LineUnit, Recipe, RecipeLine } from '../../shared/types';
import { Allergens, Field, Money, PageHead, fmtNum } from '../ui';

const NEW = 'nouvelle';
type DraftLine = { key: string; ref: string; qty: string; unit: LineUnit }; // ref = "i:<id>" ou "r:<id>"
type Draft = { name: string; category: Recipe['category']; yieldQty: string; yieldUnit: Recipe['yieldUnit']; lossPct: string; notes: string; lines: DraftLine[] };

const toDraft = (r?: Recipe): Draft => r ? {
  name: r.name, category: r.category, yieldQty: String(r.yieldQty), yieldUnit: r.yieldUnit, lossPct: String(r.lossPct), notes: r.notes,
  lines: r.lines.map((l) => ({ key: l.id, ref: l.ingredientId ? `i:${l.ingredientId}` : `r:${l.subrecipeId}`, qty: String(l.qty), unit: l.unit })),
} : { name: '', category: 'base', yieldQty: '1', yieldUnit: 'kg', lossPct: '0', notes: '', lines: [] };

const n = (s: string) => Number(s.replace(',', '.'));
const unitsFor = (target: 'kg' | 'L' | 'piece'): LineUnit[] => (target === 'kg' ? ['g', 'kg'] : target === 'L' ? ['ml', 'L'] : ['piece']);

export default function Recipes() {
  const { id = '' } = useParams();
  const { catalog } = useData();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  useEffect(() => { if (!id && catalog.recipes[0]) navigate(`/recettes/${catalog.recipes[0].id}`, { replace: true }); }, [id, catalog.recipes, navigate]);

  const list = catalog.recipes.filter((r) => r.name.toLowerCase().includes(query.toLowerCase()));
  return (
    <>
      <PageHead kicker="Fiches techniques" title="Recettes" actions={<Link className="btn" to={`/recettes/${NEW}`}>+ Nouvelle recette</Link>}>
        Une recette peut en contenir d’autres : le coût et les allergènes suivent automatiquement, à tous les niveaux.
      </PageHead>
      <div className="split">
        <aside className="card list-pane">
          <input className="search" placeholder="Rechercher…" value={query} onChange={(e) => setQuery(e.target.value)} />
          {(['base', 'assemblage'] as const).map((cat) => (
            <div key={cat}>
              <p className="list-title">{cat === 'base' ? 'Recettes de base' : 'Assemblages'}</p>
              {list.filter((r) => r.category === cat).map((r) => (
                <Link key={r.id} to={`/recettes/${r.id}`} className={`list-item${r.id === id ? ' on' : ''}`}>{r.name}</Link>
              ))}
            </div>
          ))}
        </aside>
        {id && <Editor key={id} recipeId={id} />}
      </div>
    </>
  );
}

function Editor({ recipeId }: { recipeId: string }) {
  const { catalog, derived, reload } = useData();
  const navigate = useNavigate();
  const isNew = recipeId === NEW;
  const original = derived.idx.recipes.get(recipeId);
  const [d, setD] = useState<Draft>(() => toDraft(original));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const draftId = isNew ? '__draft__' : recipeId;

  // Recette « virtuelle » construite à partir du brouillon, pour tout recalculer en direct
  const live = useMemo(() => {
    const problems: string[] = [];
    const lines: RecipeLine[] = d.lines.flatMap((l, i) => {
      const [kind, ref] = l.ref.split(':') as ['i' | 'r', string];
      if (!ref) { problems.push(`Ligne ${i + 1} : choisir un élément`); return []; }
      if (!(n(l.qty) > 0)) { problems.push(`Ligne ${i + 1} : quantité invalide`); return []; }
      const target = kind === 'i' ? derived.idx.ingredients.get(ref)?.unit : derived.idx.recipes.get(ref)?.yieldUnit;
      try { toBaseQty(n(l.qty), l.unit, target ?? 'kg'); } catch (e) { if (e instanceof UnitError) { problems.push(`Ligne ${i + 1} : ${e.message}`); return []; } throw e; }
      return [{ id: l.key, ingredientId: kind === 'i' ? ref : null, subrecipeId: kind === 'r' ? ref : null, qty: n(l.qty), unit: l.unit }];
    });
    const cycle = findCycle(draftId, lines, derived.idx);
    if (cycle) return { problems: [`Recette circulaire : ${cycle.join(' → ')}`], calc: null };
    if (!(n(d.yieldQty) > 0)) problems.push('Rendement invalide');
    if (problems.length || !lines.length) return { problems, calc: null };
    const recipe: Recipe = { id: draftId, name: d.name || 'Brouillon', category: d.category, yieldQty: n(d.yieldQty), yieldUnit: d.yieldUnit, lossPct: n(d.lossPct) || 0, notes: d.notes, lines, updatedAt: '' };
    const virtual = derive({ ...catalog, recipes: [...catalog.recipes.filter((r) => r.id !== draftId), recipe] });
    return { problems, calc: { cost: virtual.cost(draftId), allergens: virtual.allergens(draftId), recipe, virtual } };
  }, [d, catalog, derived, draftId]);

  const usedBy = isNew ? [] : [
    ...catalog.recipes.filter((r) => r.lines.some((l) => l.subrecipeId === recipeId)).map((r) => r.name),
    ...catalog.products.filter((p) => p.recipeId === recipeId).map((p) => p.name),
  ];

  const setLine = (i: number, patch: Partial<DraftLine>) => setD({ ...d, lines: d.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  const pickRef = (i: number, ref: string) => {
    const [kind, id] = ref.split(':');
    const target = kind === 'i' ? derived.idx.ingredients.get(id!)!.unit : derived.idx.recipes.get(id!)!.yieldUnit;
    const units = unitsFor(target);
    setLine(i, { ref, unit: units.includes(d.lines[i]!.unit) ? d.lines[i]!.unit : units[0]! });
  };

  const save = async () => {
    setSaving(true); setError(null);
    const body = {
      name: d.name, category: d.category, yieldQty: d.yieldQty, yieldUnit: d.yieldUnit, lossPct: d.lossPct || 0, notes: d.notes,
      lines: live.calc?.recipe.lines.map(({ ingredientId, subrecipeId, qty, unit }) => ({ ingredientId, subrecipeId, qty, unit })) ?? [],
    };
    try {
      if (isNew) { const { id } = await api.post<{ id: string }>('/recipes', body); await reload(); navigate(`/recettes/${id}`); }
      else { await api.put(`/recipes/${recipeId}`, body); await reload(); }
      notify('Recette enregistrée : coûts et allergènes recalculés partout');
    } catch (e) { setError((e as Error).message); } finally { setSaving(false); }
  };
  const remove = async () => {
    if (!confirm(`Supprimer « ${original?.name} » ?`)) return;
    try { await api.del(`/recipes/${recipeId}`); await reload(); navigate('/recettes'); notify('Recette supprimée'); }
    catch (e) { setError((e as Error).message); }
  };

  if (!isNew && !original) return <div className="card">Recette introuvable.</div>;
  const yieldLabel = d.yieldUnit === 'kg' ? 'kg' : 'pièce';

  return (
    <div className="editor">
      <section className="card">
        <div className="form-grid four">
          <Field label="Nom" className="span-3"><input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="Ex. Crème diplomate" /></Field>
          <Field label="Type">
            <select value={d.category} onChange={(e) => setD({ ...d, category: e.target.value as Recipe['category'] })}>
              <option value="base">Base</option><option value="assemblage">Assemblage</option>
            </select>
          </Field>
          <Field label="Rendement" className="span-2">
            <div className="with-action">
              <input inputMode="decimal" value={d.yieldQty} onChange={(e) => setD({ ...d, yieldQty: e.target.value })} />
              <select value={d.yieldUnit} onChange={(e) => setD({ ...d, yieldUnit: e.target.value as Recipe['yieldUnit'] })} disabled={usedBy.length > 0} title={usedBy.length ? 'Recette déjà utilisée' : ''}>
                <option value="kg">kg</option><option value="piece">pièces</option>
              </select>
            </div>
          </Field>
          <Field label="Pertes (%)" hint="chutes, cuisson, casse" className="span-2"><input inputMode="decimal" value={d.lossPct} onChange={(e) => setD({ ...d, lossPct: e.target.value })} /></Field>
        </div>

        <h3 className="sub">Composition</h3>
        <div className="lines">
          {d.lines.map((l, i) => {
            const [kind, ref] = l.ref.split(':');
            const target = ref ? (kind === 'i' ? derived.idx.ingredients.get(ref)?.unit : derived.idx.recipes.get(ref)?.yieldUnit) : undefined;
            const lineCost = live.calc?.cost.lines.find((c) => c.lineId === l.key);
            return (
              <div className="line" key={l.key}>
                <select value={l.ref} onChange={(e) => pickRef(i, e.target.value)} aria-label="Élément">
                  <option value="i:">Choisir…</option>
                  <optgroup label="Ingrédients">{catalog.ingredients.map((x) => <option key={x.id} value={`i:${x.id}`}>{x.name}</option>)}</optgroup>
                  <optgroup label="Sous-recettes">{catalog.recipes.filter((r) => r.id !== recipeId).map((x) => <option key={x.id} value={`r:${x.id}`}>{x.name}</option>)}</optgroup>
                </select>
                <input inputMode="decimal" value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} aria-label="Quantité" />
                <select value={l.unit} onChange={(e) => setLine(i, { unit: e.target.value as LineUnit })} aria-label="Unité">
                  {unitsFor(target ?? 'kg').map((u) => <option key={u} value={u}>{u === 'piece' ? 'pce' : u}</option>)}
                </select>
                <span className="num r line-cost">{lineCost ? <Money cents={lineCost.costCents} /> : '—'}</span>
                <button className="icon" onClick={() => setD({ ...d, lines: d.lines.filter((_, j) => j !== i) })} aria-label="Retirer la ligne">✕</button>
              </div>
            );
          })}
          <button className="btn ghost small" onClick={() => setD({ ...d, lines: [...d.lines, { key: crypto.randomUUID(), ref: 'i:', qty: '100', unit: 'g' }] })}>+ Ajouter une ligne</button>
        </div>

        <Field label="Notes de fabrication"><textarea rows={3} value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} /></Field>

        {live.problems.length > 0 && <ul className="problems">{live.problems.map((p) => <li key={p}>{p}</li>)}</ul>}
        {error && <p className="error">{error}</p>}
        <div className="modal-actions">
          {!isNew && <button className="btn danger ghost" onClick={remove} disabled={usedBy.length > 0} title={usedBy.length ? `Utilisée par : ${usedBy.join(', ')}` : ''}>Supprimer</button>}
          <button className="btn" onClick={save} disabled={saving || !live.calc || !d.name.trim()}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
        </div>
      </section>

      <aside className="side-col">
        <section className="card live">
          <p className="kicker">Calcul en direct</p>
          {live.calc ? (
            <>
              <div className="big-cost"><Money cents={live.calc.cost.perUnitCents} /><span className="unit">/ {yieldLabel}</span></div>
              <p className="muted small">Fournée : <Money cents={live.calc.cost.totalCents} /> pour {fmtNum(usableYield(live.calc.recipe), 2)} {yieldLabel} utilisables</p>
              <ul className="bars tight">
                {live.calc.cost.lines.slice(0, 5).map((c) => (
                  <li key={c.lineId}><span className="bar-label">{c.label}</span><span className="bar"><i style={{ width: `${c.share * 100}%` }} /></span><span className="num bar-val">{fmtNum(c.share * 100, 0)} %</span></li>
                ))}
              </ul>
              <h3 className="sub">Allergènes</h3>
              <Allergens codes={live.calc.allergens} />
            </>
          ) : <p className="muted">Complétez la composition pour voir le coût.</p>}
          {usedBy.length > 0 && <><h3 className="sub">Utilisée dans</h3><p className="small">{usedBy.join(', ')}</p></>}
        </section>
        {live.calc && <WeighingSheet recipe={live.calc.recipe} virtual={live.calc.virtual} />}
      </aside>
    </div>
  );
}

/** Fiche de pesée : quantités d'ingrédients bruts pour produire une quantité voulue. */
function WeighingSheet({ recipe, virtual }: { recipe: Recipe; virtual: ReturnType<typeof derive> }) {
  const [qty, setQty] = useState(recipe.yieldUnit === 'piece' ? String(recipe.yieldQty) : fmtNum(usableYield(recipe), 1));
  const need = n(qty) > 0 ? [...explode(recipe.id, n(qty), virtual.idx).entries()] : [];
  const fmt = (id: string, q: number) => {
    const unit = virtual.idx.ingredients.get(id)!.unit;
    if (unit === 'piece') return `${fmtNum(Math.ceil(q * 10) / 10, q < 10 ? 1 : 0)} pce`;
    return q < 1 ? `${fmtNum(q * 1000, 0)} ${unit === 'L' ? 'ml' : 'g'}` : `${fmtNum(q, 3)} ${unit}`;
  };
  return (
    <section className="card weigh">
      <div className="card-head"><h2>Fiche de pesée</h2><button className="btn ghost small" onClick={() => window.print()}>Imprimer</button></div>
      <Field label={`Je veux produire (${recipe.yieldUnit === 'kg' ? 'kg' : 'pièces'})`}><input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
      <table className="table compact">
        <tbody>{need.sort((a, b) => b[1] - a[1]).map(([id, q]) => <tr key={id}><td>{virtual.idx.ingredients.get(id)!.name}</td><td className="r num">{fmt(id, q)}</td></tr>)}</tbody>
      </table>
    </section>
  );
}
