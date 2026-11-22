// Moteur métier de Fournil : pur, sans I/O, partagé par l'API et l'interface.
// Coût de revient récursif, allergènes, cycles, marges, simulations.

import type { Catalog, Ingredient, Product, Recipe, RecipeLine, LineUnit } from './types';

export class CycleError extends Error {
  constructor(public path: string[]) {
    super(`Recette circulaire : ${path.join(' → ')}`);
  }
}
export class UnitError extends Error {}

export interface Index {
  ingredients: Map<string, Ingredient>;
  recipes: Map<string, Recipe>;
}

export const buildIndex = (c: Pick<Catalog, 'ingredients' | 'recipes'>): Index => ({
  ingredients: new Map(c.ingredients.map((i) => [i.id, i])),
  recipes: new Map(c.recipes.map((r) => [r.id, r])),
});

/** Convertit la quantité d'une ligne dans l'unité de base de sa cible (kg, L ou pièce). */
export function toBaseQty(qty: number, unit: LineUnit, target: 'kg' | 'L' | 'piece'): number {
  const table: Record<string, Partial<Record<LineUnit, number>>> = {
    kg: { g: 0.001, kg: 1 },
    L: { ml: 0.001, L: 1 },
    piece: { piece: 1 },
  };
  const factor = table[target]?.[unit];
  if (factor === undefined) throw new UnitError(`Unité « ${unit} » incompatible avec ${target}`);
  return qty * factor;
}

/** Rendement réellement utilisable, pertes déduites. */
export const usableYield = (r: Recipe) => r.yieldQty * (1 - r.lossPct / 100);

export const lineLabel = (l: RecipeLine, idx: Index) =>
  l.ingredientId ? idx.ingredients.get(l.ingredientId)?.name ?? '?' : idx.recipes.get(l.subrecipeId!)?.name ?? '?';

function lineBaseQty(l: RecipeLine, idx: Index): number {
  if (l.ingredientId) {
    const ing = idx.ingredients.get(l.ingredientId);
    if (!ing) throw new Error(`Ingrédient introuvable : ${l.ingredientId}`);
    return toBaseQty(l.qty, l.unit, ing.unit);
  }
  const sub = idx.recipes.get(l.subrecipeId!);
  if (!sub) throw new Error(`Recette introuvable : ${l.subrecipeId}`);
  return toBaseQty(l.qty, l.unit, sub.yieldUnit);
}

export interface CostLine { lineId: string; label: string; kind: 'ingredient' | 'recette'; costCents: number; share: number }
export interface RecipeCost {
  totalCents: number;          // coût d'une fournée complète
  perUnitCents: number;        // coût par kg ou par pièce utilisable
  lines: CostLine[];
  incomplete: boolean;         // un prix manque quelque part (rôle vendeur, ingrédient sans prix)
}

/** Calcule le coût de revient de toutes les recettes, avec mémo et détection de cycles. */
export function createCostCalculator(idx: Index) {
  const memo = new Map<string, RecipeCost>();
  const visiting: string[] = [];

  function cost(recipeId: string): RecipeCost {
    const cached = memo.get(recipeId);
    if (cached) return cached;
    const r = idx.recipes.get(recipeId);
    if (!r) throw new Error(`Recette introuvable : ${recipeId}`);
    if (visiting.includes(recipeId)) {
      const start = visiting.indexOf(recipeId);
      throw new CycleError([...visiting.slice(start), recipeId].map((id) => idx.recipes.get(id)?.name ?? id));
    }
    visiting.push(recipeId);
    let incomplete = false;
    const raw = r.lines.map((l) => {
      const q = lineBaseQty(l, idx);
      let unitCost: number;
      if (l.ingredientId) {
        const p = idx.ingredients.get(l.ingredientId)!.priceCents;
        if (p === undefined) incomplete = true;
        unitCost = p ?? 0;
      } else {
        const sub = cost(l.subrecipeId!);
        if (sub.incomplete) incomplete = true;
        unitCost = sub.perUnitCents;
      }
      return { lineId: l.id, label: lineLabel(l, idx), kind: l.ingredientId ? 'ingredient' as const : 'recette' as const, costCents: q * unitCost };
    });
    visiting.pop();
    const totalCents = raw.reduce((s, x) => s + x.costCents, 0);
    const result: RecipeCost = {
      totalCents,
      perUnitCents: totalCents / usableYield(r),
      lines: raw.map((x) => ({ ...x, share: totalCents ? x.costCents / totalCents : 0 })).sort((a, b) => b.costCents - a.costCents),
      incomplete,
    };
    memo.set(recipeId, result);
    return result;
  }
  return cost;
}

/** Allergènes d'une recette, propagés depuis toutes les sous-recettes. */
export function createAllergenResolver(idx: Index) {
  const memo = new Map<string, Set<string>>();
  function resolve(recipeId: string, stack: string[] = []): Set<string> {
    const cached = memo.get(recipeId);
    if (cached) return cached;
    if (stack.includes(recipeId)) throw new CycleError([...stack, recipeId].map((id) => idx.recipes.get(id)?.name ?? id));
    const r = idx.recipes.get(recipeId);
    if (!r) return new Set();
    const out = new Set<string>();
    for (const l of r.lines) {
      if (l.ingredientId) idx.ingredients.get(l.ingredientId)?.allergens.forEach((a) => out.add(a));
      else resolve(l.subrecipeId!, [...stack, recipeId]).forEach((a) => out.add(a));
    }
    memo.set(recipeId, out);
    return out;
  }
  return resolve;
}

/** Vérifie qu'enregistrer ces lignes pour cette recette ne crée pas de boucle. Renvoie le chemin fautif ou null. */
export function findCycle(recipeId: string, lines: RecipeLine[], idx: Index): string[] | null {
  const recipes = new Map(idx.recipes);
  const current = recipes.get(recipeId);
  recipes.set(recipeId, { ...(current ?? { id: recipeId, name: 'Nouvelle recette', category: 'base', yieldQty: 1, yieldUnit: 'kg', lossPct: 0, notes: '', updatedAt: '' }), lines });
  const resolve = createAllergenResolver({ ingredients: idx.ingredients, recipes });
  try { resolve(recipeId); return null; } catch (e) { if (e instanceof CycleError) return e.path; throw e; }
}

export interface Economics {
  costCents: number;
  priceHtCents: number;
  marginCents: number;
  coef: number;          // prix HT / coût matière
  foodCostPct: number;   // coût matière / prix HT
  belowTarget: boolean;
  incomplete: boolean;
}

export function productEconomics(p: Product, cost: (id: string) => RecipeCost, targetCoef: number): Economics {
  const rc = cost(p.recipeId);
  const costCents = rc.perUnitCents * p.portionQty;
  const priceHtCents = p.priceCents / (1 + p.vatRate / 100);
  const coef = costCents > 0 ? priceHtCents / costCents : Infinity;
  return {
    costCents,
    priceHtCents,
    marginCents: priceHtCents - costCents,
    coef,
    foodCostPct: priceHtCents > 0 ? (100 * costCents) / priceHtCents : 0,
    belowTarget: !rc.incomplete && coef < targetCoef,
    incomplete: rc.incomplete,
  };
}

/** Prix TTC conseillé pour atteindre le coefficient visé, arrondi aux 10 centimes supérieurs. */
export function suggestedPrice(costCents: number, vatRate: number, targetCoef: number): number {
  return Math.ceil((costCents * targetCoef * (1 + vatRate / 100)) / 10) * 10;
}

/** Recettes et produits qui dépendent (directement ou non) d'un ingrédient. */
export function whereUsed(ingredientId: string, catalog: Catalog) {
  const recipes = new Set<string>();
  let grew = true;
  while (grew) {
    grew = false;
    for (const r of catalog.recipes) {
      if (recipes.has(r.id)) continue;
      if (r.lines.some((l) => l.ingredientId === ingredientId || (l.subrecipeId && recipes.has(l.subrecipeId)))) {
        recipes.add(r.id); grew = true;
      }
    }
  }
  return { recipeIds: [...recipes], productIds: catalog.products.filter((p) => recipes.has(p.recipeId)).map((p) => p.id) };
}

/** Éclate une recette en ingrédients bruts pour une quantité donnée (fiche de pesée). */
export function explode(recipeId: string, qty: number, idx: Index, acc = new Map<string, number>()): Map<string, number> {
  const r = idx.recipes.get(recipeId);
  if (!r) return acc;
  const factor = qty / usableYield(r);
  for (const l of r.lines) {
    const q = lineBaseQty(l, idx) * factor;
    if (l.ingredientId) acc.set(l.ingredientId, (acc.get(l.ingredientId) ?? 0) + q);
    else explode(l.subrecipeId!, q, idx, acc);
  }
  return acc;
}

/** Masse estimée d'une pièce quand l'ingrédient est compté à l'unité (œuf, gousse…). */
export const PIECE_KG = 0.05;

/**
 * Liste des ingrédients pour l'étiquetage : par ordre décroissant de poids (règle INCO),
 * allergènes repérés pour être mis en évidence. Les litres sont assimilés à des kilos.
 */
export function labelIngredients(recipeId: string, idx: Index) {
  const r = idx.recipes.get(recipeId);
  if (!r) return [];
  const raw = explode(recipeId, usableYield(r), idx);
  const items = [...raw.entries()].map(([id, q]) => {
    const ing = idx.ingredients.get(id)!;
    return { id, name: ing.name, kg: ing.unit === 'piece' ? q * PIECE_KG : q, allergens: ing.allergens };
  });
  const total = items.reduce((s, x) => s + x.kg, 0) || 1;
  return items.sort((a, b) => b.kg - a.kg).map((x) => ({ ...x, pct: (100 * x.kg) / total }));
}

/** Applique des variations de prix (en %) à une copie du catalogue. */
export function withPriceChanges(catalog: Catalog, changesPct: Record<string, number>): Catalog {
  return {
    ...catalog,
    ingredients: catalog.ingredients.map((i) =>
      changesPct[i.id] && i.priceCents !== undefined ? { ...i, priceCents: i.priceCents * (1 + changesPct[i.id]! / 100) } : i),
  };
}

export const euros = (cents: number, digits = 2) =>
  (cents / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: digits, maximumFractionDigits: digits });
