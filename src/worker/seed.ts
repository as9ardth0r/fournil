import type { Catalog, Ingredient, Product, Recipe } from '../shared/types';
import { SEED_HISTORY, SEED_INGREDIENTS, SEED_PRODUCTS, SEED_RECIPES } from './seed-data';

/** Construit le catalogue de démonstration. `id` traduit un alias en identifiant. */
export function buildSeed(id: (alias: string) => string = (a) => a): Omit<Catalog, 'bakery'> {
  const now = new Date().toISOString();
  const ingAliases = new Set(SEED_INGREDIENTS.map(([a]) => a));
  const ingredients: Ingredient[] = SEED_INGREDIENTS.map(([alias, name, unit, price, supplier, allergens]) => ({
    id: id(alias), name, unit, priceCents: Math.round(price * 100), supplier, allergens, updatedAt: now,
  }));
  const recipes: Recipe[] = SEED_RECIPES.map((r) => ({
    id: id(r.alias), name: r.name, category: r.category, yieldQty: r.yieldQty, yieldUnit: r.yieldUnit,
    lossPct: r.lossPct, notes: r.notes ?? '', updatedAt: now,
    lines: r.lines.map(([target, qty, unit], i) => ({
      id: id(`${r.alias}#${i}`),
      ingredientId: ingAliases.has(target) ? id(target) : null,
      subrecipeId: ingAliases.has(target) ? null : id(target),
      qty, unit,
    })),
  }));
  const products: Product[] = SEED_PRODUCTS.map(([name, recipe, portionQty, price], i) => ({
    id: id(`p${i}`), name, recipeId: id(recipe), portionQty, priceCents: Math.round(price * 100), vatRate: 5.5, active: true,
  }));
  return { ingredients, recipes, products };
}

export function seedHistory(id: (alias: string) => string) {
  const rows: { ingredientId: string; priceCents: number; changedAt: string }[] = [];
  for (const [alias, points] of Object.entries(SEED_HISTORY)) {
    for (const [monthsAgo, euros] of points) {
      const d = new Date();
      d.setMonth(d.getMonth() - monthsAgo);
      rows.push({ ingredientId: id(alias), priceCents: Math.round(euros * 100), changedAt: d.toISOString().slice(0, 19).replace('T', ' ') });
    }
  }
  return rows;
}

/** Insère le jeu de démonstration pour une boulangerie donnée (une seule transaction D1). */
export async function insertSeed(db: D1Database, bakeryId: string) {
  const map = new Map<string, string>();
  const id = (alias: string) => {
    let v = map.get(alias);
    if (!v) { v = crypto.randomUUID(); map.set(alias, v); }
    return v;
  };
  const seed = buildSeed(id);
  const stmts: D1PreparedStatement[] = [];
  for (const i of seed.ingredients) {
    stmts.push(db.prepare('INSERT INTO ingredients (id, bakery_id, name, unit, price_cents, supplier, allergens) VALUES (?,?,?,?,?,?,?)')
      .bind(i.id, bakeryId, i.name, i.unit, i.priceCents, i.supplier, JSON.stringify(i.allergens)));
  }
  for (const h of seedHistory(id)) {
    stmts.push(db.prepare('INSERT INTO price_history (ingredient_id, price_cents, changed_at) VALUES (?,?,?)').bind(h.ingredientId, h.priceCents, h.changedAt));
  }
  for (const r of seed.recipes) {
    stmts.push(db.prepare('INSERT INTO recipes (id, bakery_id, name, category, yield_qty, yield_unit, loss_pct, notes) VALUES (?,?,?,?,?,?,?,?)')
      .bind(r.id, bakeryId, r.name, r.category, r.yieldQty, r.yieldUnit, r.lossPct, r.notes));
  }
  for (const r of seed.recipes) {
    r.lines.forEach((l, pos) => stmts.push(
      db.prepare('INSERT INTO recipe_lines (id, recipe_id, ingredient_id, subrecipe_id, qty, unit, position) VALUES (?,?,?,?,?,?,?)')
        .bind(l.id, r.id, l.ingredientId, l.subrecipeId, l.qty, l.unit, pos)));
  }
  for (const p of seed.products) {
    stmts.push(db.prepare('INSERT INTO products (id, bakery_id, name, recipe_id, portion_qty, price_cents, vat_rate) VALUES (?,?,?,?,?,?,?)')
      .bind(p.id, bakeryId, p.name, p.recipeId, p.portionQty, p.priceCents, p.vatRate));
  }
  await db.batch(stmts);
}
