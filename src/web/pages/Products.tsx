import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../store';
import { api } from '../api';
import { notify } from '../App';
import { suggestedPrice } from '../../shared/domain';
import type { Product } from '../../shared/types';
import { Allergens, CoefBadge, Field, Modal, Money, PageHead, fmtNum } from '../ui';
import { CostTree } from '../CostTree';

type SortKey = 'name' | 'coef' | 'margin';

export default function Products() {
  const { catalog, derived, can } = useData();
  const [sort, setSort] = useState<SortKey>('name');
  const [detail, setDetail] = useState<Product | null>(null);
  const [editing, setEditing] = useState<Partial<Product> | null>(null);
  const target = catalog.bakery.targetCoef;

  const rows = catalog.products.map((p) => ({ p, e: derived.econ.get(p.id)! })).sort((a, b) =>
    sort === 'name' ? a.p.name.localeCompare(b.p.name) : sort === 'coef' ? a.e.coef - b.e.coef : b.e.marginCents - a.e.marginCents);

  return (
    <>
      <PageHead kicker="Gamme" title="Produits"
        actions={can.editProducts && <button className="btn" onClick={() => setEditing({ vatRate: 5.5, portionQty: 1, active: true })}>+ Nouveau produit</button>}>
        {can.seeCosts ? 'Coût matière, prix et coefficient de chaque produit. Cliquez sur un produit pour voir d’où vient son coût.' : 'Les produits en vente et leurs allergènes.'}
      </PageHead>

      <section className="card flush">
        <table className="table hover">
          <thead>
            <tr>
              <th><button className="th-sort" onClick={() => setSort('name')}>Produit</button></th>
              {can.seeCosts && <th className="r">Coût matière</th>}
              <th className="r">Prix TTC</th>
              {can.seeCosts && <th className="r"><button className="th-sort" onClick={() => setSort('margin')}>Marge HT</button></th>}
              {can.seeCosts && <th className="r"><button className="th-sort" onClick={() => setSort('coef')}>Coef.</button></th>}
              {can.seeCosts && <th className="r">Coût / prix HT</th>}
              <th>Allergènes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ p, e }) => (
              <tr key={p.id} onClick={() => setDetail(p)} className={p.active ? '' : 'inactive'}>
                <td><strong>{p.name}</strong>{!p.active && <span className="badge muted">hors vente</span>}</td>
                {can.seeCosts && <td className="r"><Money cents={e.costCents} /></td>}
                <td className="r"><Money cents={p.priceCents} /></td>
                {can.seeCosts && <td className="r"><Money cents={e.marginCents} /></td>}
                {can.seeCosts && <td className="r"><CoefBadge coef={e.coef} target={target} /></td>}
                {can.seeCosts && <td className="r num">{fmtNum(e.foodCostPct, 0)} %</td>}
                <td><Allergens codes={derived.allergens(p.recipeId)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {detail && <ProductDetail product={detail} onClose={() => setDetail(null)} onEdit={() => { setEditing(detail); setDetail(null); }} />}
      {editing && <ProductForm initial={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function ProductDetail({ product: p, onClose, onEdit }: { product: Product; onClose: () => void; onEdit: () => void }) {
  const { catalog, derived, can } = useData();
  const e = derived.econ.get(p.id)!;
  const recipe = derived.idx.recipes.get(p.recipeId)!;
  const target = catalog.bakery.targetCoef;
  return (
    <Modal title={p.name} onClose={onClose} wide>
      {can.seeCosts && (
        <div className="kpis compact">
          <div className="kpi"><span>Coût matière</span><strong><Money cents={e.costCents} /></strong></div>
          <div className="kpi"><span>Prix HT</span><strong><Money cents={e.priceHtCents} /></strong><small>TVA {fmtNum(p.vatRate)} %</small></div>
          <div className="kpi"><span>Marge HT</span><strong><Money cents={e.marginCents} /></strong></div>
          <div className={`kpi${e.belowTarget ? ' alert' : ''}`}><span>Coefficient</span><strong className="num">×{fmtNum(e.coef, 2)}</strong>
            <small>{e.belowTarget ? <>prix conseillé <Money cents={suggestedPrice(e.costCents, p.vatRate, target)} /></> : 'objectif atteint'}</small></div>
        </div>
      )}
      <h3 className="sub">Allergènes</h3>
      <Allergens codes={derived.allergens(p.recipeId)} />
      {can.seeCosts && (
        <>
          <h3 className="sub">D’où vient le coût <small>— recette « {recipe.name} », {fmtNum(p.portionQty, p.portionQty % 1 ? 2 : 0)} {recipe.yieldUnit === 'piece' ? 'pièce' : 'kg'}</small></h3>
          <CostTree recipeId={p.recipeId} qty={p.portionQty} />
        </>
      )}
      <div className="modal-actions">
        <Link className="btn ghost" to={`/etiquette/${p.id}`}>Étiquette</Link>
        {can.editCatalog && <Link className="btn ghost" to={`/recettes/${p.recipeId}`}>Ouvrir la recette</Link>}
        {can.editProducts && <button className="btn" onClick={onEdit}>Modifier</button>}
      </div>
    </Modal>
  );
}

function ProductForm({ initial, onClose }: { initial: Partial<Product>; onClose: () => void }) {
  const { catalog, derived, reload } = useData();
  const [f, setF] = useState({
    name: initial.name ?? '', recipeId: initial.recipeId ?? catalog.recipes.find((r) => r.category === 'assemblage')?.id ?? '',
    portionQty: String(initial.portionQty ?? 1), price: initial.priceCents !== undefined ? String(initial.priceCents / 100) : '',
    vatRate: String(initial.vatRate ?? 5.5), active: initial.active ?? true,
  });
  const [error, setError] = useState<string | null>(null);
  const recipe = derived.idx.recipes.get(f.recipeId);
  const portion = Number(f.portionQty.replace(',', '.')) || 0;
  const cost = recipe ? derived.cost(recipe.id).perUnitCents * portion : 0;
  const advice = suggestedPrice(cost, Number(f.vatRate), catalog.bakery.targetCoef);

  const save = async () => {
    setError(null);
    const body = { name: f.name, recipeId: f.recipeId, portionQty: f.portionQty, priceCents: Math.round(Number(f.price.replace(',', '.')) * 100), vatRate: f.vatRate, active: f.active };
    try {
      if (initial.id) await api.put(`/products/${initial.id}`, body); else await api.post('/products', body);
      await reload(); notify('Produit enregistré'); onClose();
    } catch (e) { setError((e as Error).message); }
  };
  const remove = async () => {
    if (!initial.id || !confirm(`Supprimer « ${initial.name} » ?`)) return;
    await api.del(`/products/${initial.id}`); await reload(); notify('Produit supprimé'); onClose();
  };

  return (
    <Modal title={initial.id ? 'Modifier le produit' : 'Nouveau produit'} onClose={onClose}>
      <div className="form-grid">
        <Field label="Nom"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></Field>
        <Field label="Recette">
          <select value={f.recipeId} onChange={(e) => setF({ ...f, recipeId: e.target.value })}>
            {['assemblage', 'base'].map((cat) => (
              <optgroup key={cat} label={cat === 'assemblage' ? 'Assemblages' : 'Recettes de base'}>
                {catalog.recipes.filter((r) => r.category === cat).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </optgroup>
            ))}
          </select>
        </Field>
        <Field label={`Portion (${recipe?.yieldUnit === 'piece' ? 'pièces' : 'kg'})`}><input inputMode="decimal" value={f.portionQty} onChange={(e) => setF({ ...f, portionQty: e.target.value })} /></Field>
        <Field label="TVA">
          <select value={f.vatRate} onChange={(e) => setF({ ...f, vatRate: e.target.value })}>
            <option value="5.5">5,5 % (à emporter)</option><option value="10">10 % (sur place)</option><option value="20">20 %</option>
          </select>
        </Field>
        <Field label="Prix de vente TTC (€)" hint={`Coût matière ${(cost / 100).toFixed(2).replace('.', ',')} € · conseillé ${(advice / 100).toFixed(2).replace('.', ',')} € pour ×${catalog.bakery.targetCoef}`}>
          <div className="with-action"><input inputMode="decimal" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} />
            <button type="button" className="btn ghost small" onClick={() => setF({ ...f, price: (advice / 100).toFixed(2) })}>Appliquer</button></div>
        </Field>
        <label className="check"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> En vente</label>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="modal-actions">
        {initial.id && <button className="btn danger ghost" onClick={remove}>Supprimer</button>}
        <button className="btn" onClick={save}>Enregistrer</button>
      </div>
    </Modal>
  );
}
