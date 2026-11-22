import { useState } from 'react';
import { useData } from './store';
import { lineLabel, toBaseQty, usableYield } from '../shared/domain';
import { Money, fmtNum } from './ui';

const unitLabel = (u: string) => (u === 'piece' ? 'pce' : u);

/**
 * Décomposition dépliable du coût d'une recette pour une quantité donnée
 * (dans l'unité de rendement de la recette). Chaque sous-recette s'ouvre d'un clic.
 */
export function CostTree({ recipeId, qty, depth = 0 }: { recipeId: string; qty: number; depth?: number }) {
  const { derived } = useData();
  const r = derived.idx.recipes.get(recipeId);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  if (!r) return null;
  const factor = qty / usableYield(r);
  const total = derived.cost(recipeId).perUnitCents * qty;

  return (
    <ul className={`tree depth-${depth}`}>
      {r.lines.map((l) => {
        const sub = l.subrecipeId ? derived.idx.recipes.get(l.subrecipeId) : null;
        const target = l.ingredientId ? derived.idx.ingredients.get(l.ingredientId)!.unit : sub!.yieldUnit;
        const baseQty = toBaseQty(l.qty, l.unit, target) * factor;
        const unitCost = l.ingredientId ? derived.idx.ingredients.get(l.ingredientId)!.priceCents ?? 0 : derived.cost(l.subrecipeId!).perUnitCents;
        const cents = baseQty * unitCost;
        const share = total ? cents / total : 0;
        const shownQty = target === 'piece' ? `${fmtNum(baseQty, baseQty < 10 ? 1 : 0)} pce` : baseQty < 1 ? `${fmtNum(baseQty * 1000, 0)} ${target === 'L' ? 'ml' : 'g'}` : `${fmtNum(baseQty, 2)} ${unitLabel(target)}`;
        return (
          <li key={l.id}>
            <div className={`tree-row${sub ? ' has-sub' : ''}`} onClick={() => sub && setOpen({ ...open, [l.id]: !open[l.id] })}>
              <span className="tree-name">{sub ? <span className="caret">{open[l.id] ? '▾' : '▸'}</span> : <span className="caret dot">·</span>}{lineLabel(l, derived.idx)}</span>
              <span className="num muted">{shownQty}</span>
              <span className="tree-bar"><i style={{ width: `${share * 100}%` }} /></span>
              <span className="num r"><Money cents={cents} /></span>
            </div>
            {sub && open[l.id] && <CostTree recipeId={sub.id} qty={baseQty} depth={depth + 1} />}
          </li>
        );
      })}
    </ul>
  );
}
