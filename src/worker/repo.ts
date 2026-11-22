// Accès aux données : toutes les requêtes sont cloisonnées par boulangerie.

import type { Catalog, Ingredient, Product, Recipe, Role } from '../shared/types';

type Row = Record<string, unknown>;

export async function loadCatalog(db: D1Database, bakeryId: string, role: Role): Promise<Catalog> {
  const [bakery, ings, recs, lines, prods] = await db.batch<Row>([
    db.prepare('SELECT id, name, is_demo, target_coef FROM bakeries WHERE id = ?').bind(bakeryId),
    db.prepare('SELECT * FROM ingredients WHERE bakery_id = ? ORDER BY name').bind(bakeryId),
    db.prepare('SELECT * FROM recipes WHERE bakery_id = ? ORDER BY category, name').bind(bakeryId),
    db.prepare('SELECT l.* FROM recipe_lines l JOIN recipes r ON r.id = l.recipe_id WHERE r.bakery_id = ? ORDER BY l.position').bind(bakeryId),
    db.prepare('SELECT * FROM products WHERE bakery_id = ? ORDER BY name').bind(bakeryId),
  ]);
  const b = bakery!.results[0]!;
  const showCosts = role !== 'vendeur'; // le vendeur ne voit ni prix d'achat ni coûts

  const ingredients: Ingredient[] = ings!.results.map((r) => ({
    id: String(r.id), name: String(r.name), unit: r.unit as Ingredient['unit'],
    ...(showCosts ? { priceCents: Number(r.price_cents) } : {}),
    supplier: showCosts ? String(r.supplier) : '', allergens: JSON.parse(String(r.allergens)), updatedAt: String(r.updated_at),
  }));
  const byRecipe = new Map<string, Recipe['lines']>();
  for (const l of lines!.results) {
    const list = byRecipe.get(String(l.recipe_id)) ?? [];
    list.push({ id: String(l.id), ingredientId: (l.ingredient_id as string) ?? null, subrecipeId: (l.subrecipe_id as string) ?? null, qty: Number(l.qty), unit: l.unit as never });
    byRecipe.set(String(l.recipe_id), list);
  }
  const recipes: Recipe[] = recs!.results.map((r) => ({
    id: String(r.id), name: String(r.name), category: r.category as Recipe['category'], yieldQty: Number(r.yield_qty),
    yieldUnit: r.yield_unit as Recipe['yieldUnit'], lossPct: Number(r.loss_pct), notes: String(r.notes),
    lines: byRecipe.get(String(r.id)) ?? [], updatedAt: String(r.updated_at),
  }));
  const products: Product[] = prods!.results.map((r) => ({
    id: String(r.id), name: String(r.name), recipeId: String(r.recipe_id), portionQty: Number(r.portion_qty),
    priceCents: Number(r.price_cents), vatRate: Number(r.vat_rate), active: r.active === 1,
  }));
  return {
    bakery: { id: String(b.id), name: String(b.name), isDemo: b.is_demo === 1, targetCoef: Number(b.target_coef) },
    ingredients, recipes, products,
  };
}
