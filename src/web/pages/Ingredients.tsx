import { useEffect, useState } from 'react';
import { useData } from '../store';
import { api } from '../api';
import { notify } from '../App';
import { ALLERGENS } from '../../shared/allergens';
import { whereUsed } from '../../shared/domain';
import type { Ingredient } from '../../shared/types';
import { Allergens, Field, Modal, Money, PageHead, Sparkline, fmtNum } from '../ui';

const UNIT: Record<Ingredient['unit'], string> = { kg: 'kg', L: 'L', piece: 'pièce' };

export default function Ingredients() {
  const { catalog } = useData();
  const [editing, setEditing] = useState<Partial<Ingredient> | null>(null);
  const [query, setQuery] = useState('');
  const list = catalog.ingredients.filter((i) => `${i.name} ${i.supplier}`.toLowerCase().includes(query.toLowerCase()));

  return (
    <>
      <PageHead kicker="Matières premières" title="Ingrédients"
        actions={<button className="btn" onClick={() => setEditing({ unit: 'kg', allergens: [] })}>+ Nouvel ingrédient</button>}>
        Mettez un prix à jour : tous les coûts de revient et toutes les marges suivent instantanément.
      </PageHead>
      <section className="card flush">
        <div className="table-tools"><input className="search" placeholder="Rechercher un ingrédient ou un fournisseur…" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
        <table className="table hover">
          <thead><tr><th>Ingrédient</th><th className="r">Prix HT</th><th>Fournisseur</th><th>Allergènes</th><th className="r">Utilisé dans</th></tr></thead>
          <tbody>
            {list.map((i) => {
              const used = whereUsed(i.id, catalog).productIds.length;
              return (
                <tr key={i.id} onClick={() => setEditing(i)}>
                  <td><strong>{i.name}</strong></td>
                  <td className="r"><Money cents={i.priceCents} /> <span className="muted small">/ {UNIT[i.unit]}</span></td>
                  <td className="muted">{i.supplier || '—'}</td>
                  <td><Allergens codes={i.allergens} empty="—" /></td>
                  <td className="r num">{used ? `${used} produit${used > 1 ? 's' : ''}` : <span className="muted">—</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      {editing && <IngredientForm initial={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function IngredientForm({ initial, onClose }: { initial: Partial<Ingredient>; onClose: () => void }) {
  const { catalog, derived, reload } = useData();
  const [f, setF] = useState({
    name: initial.name ?? '', unit: initial.unit ?? 'kg', supplier: initial.supplier ?? '',
    price: initial.priceCents !== undefined ? (initial.priceCents / 100).toFixed(2) : '', allergens: new Set(initial.allergens ?? []),
  });
  const [history, setHistory] = useState<{ priceCents: number; changedAt: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (initial.id) api.get<typeof history>(`/ingredients/${initial.id}/history`).then(setHistory); }, [initial.id]);

  const impacted = initial.id ? whereUsed(initial.id, catalog).productIds.map((id) => catalog.products.find((p) => p.id === id)!) : [];
  const newPrice = Math.round(Number(f.price.replace(',', '.')) * 100);
  const delta = initial.priceCents ? ((newPrice - initial.priceCents) / initial.priceCents) * 100 : 0;

  const save = async () => {
    setError(null);
    const body = { name: f.name, unit: f.unit, supplier: f.supplier, priceCents: newPrice, allergens: [...f.allergens] };
    try {
      if (initial.id) await api.put(`/ingredients/${initial.id}`, body); else await api.post('/ingredients', body);
      await reload();
      notify(impacted.length && delta ? `Prix mis à jour : ${impacted.length} produit(s) recalculé(s)` : 'Ingrédient enregistré');
      onClose();
    } catch (e) { setError((e as Error).message); }
  };
  const remove = async () => {
    if (!initial.id || !confirm(`Supprimer « ${initial.name} » ?`)) return;
    try { await api.del(`/ingredients/${initial.id}`); await reload(); notify('Ingrédient supprimé'); onClose(); }
    catch (e) { setError((e as Error).message); }
  };
  const toggle = (code: string) => { const s = new Set(f.allergens); s.has(code) ? s.delete(code) : s.add(code); setF({ ...f, allergens: s }); };

  return (
    <Modal title={initial.id ? initial.name! : 'Nouvel ingrédient'} onClose={onClose} wide>
      <div className="form-grid four">
        <Field label="Nom" className="span-2"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus={!initial.id} /></Field>
        <Field label="Unité d’achat">
          <select value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value as Ingredient['unit'] })}>
            <option value="kg">kg</option><option value="L">litre</option><option value="piece">pièce</option>
          </select>
        </Field>
        <Field label={`Prix HT (€ / ${UNIT[f.unit]})`} hint={delta ? `${delta > 0 ? '+' : ''}${fmtNum(delta, 1)} % par rapport à l’actuel` : undefined}>
          <input inputMode="decimal" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} />
        </Field>
        <Field label="Fournisseur" className="span-2"><input value={f.supplier} onChange={(e) => setF({ ...f, supplier: e.target.value })} /></Field>
      </div>

      <h3 className="sub">Allergènes <small>— règlement INCO, 14 allergènes majeurs</small></h3>
      <div className="allergen-picker">
        {ALLERGENS.map((a) => (
          <button key={a.code} type="button" className={`pick${f.allergens.has(a.code) ? ' on' : ''}`} onClick={() => toggle(a.code)} aria-pressed={f.allergens.has(a.code)}>{a.short}</button>
        ))}
      </div>

      {initial.id && (
        <div className="grid-2 tight">
          <div>
            <h3 className="sub">Historique du prix</h3>
            <Sparkline points={history.map((h) => h.priceCents)} width={300} height={70} />
            {history.length > 1 && <p className="muted small">Depuis le {new Date(history[0]!.changedAt.replace(' ', 'T') + 'Z').toLocaleDateString('fr-FR')} : <Money cents={history[0]!.priceCents} /> → <Money cents={history[history.length - 1]!.priceCents} /></p>}
          </div>
          <div>
            <h3 className="sub">Produits concernés</h3>
            {impacted.length ? (
              <ul className="impact">
                {impacted.map((p) => {
                  const e = derived.econ.get(p.id)!;
                  return <li key={p.id}><span>{p.name}</span><span className="num muted">coef. ×{fmtNum(e.coef, 2)}</span></li>;
                })}
              </ul>
            ) : <p className="muted small">Aucun produit pour l’instant.</p>}
          </div>
        </div>
      )}
      {error && <p className="error">{error}</p>}
      <div className="modal-actions">
        {initial.id && <button className="btn danger ghost" onClick={remove}>Supprimer</button>}
        <button className="btn" onClick={save}>Enregistrer</button>
      </div>
    </Modal>
  );
}
