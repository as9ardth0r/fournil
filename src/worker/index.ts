import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { secureHeaders } from 'hono/secure-headers';
import { type Env, requireAuth, currentUser, allow, hashPassword, verifyPassword, openSession, closeSession } from './auth';
import { loadCatalog } from './repo';
import { insertSeed } from './seed';
import { str, num, oneOf, allergens, obj, bad } from './validate';
import { buildIndex, findCycle, toBaseQty, UnitError } from '../shared/domain';
import type { RecipeLine, Role } from '../shared/types';

const ROLES = ['patron', 'chef', 'vendeur'] as const satisfies readonly Role[];
const app = new Hono<Env>().basePath('/api');

app.use('*', secureHeaders());
app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
  console.error(err);
  return c.json({ error: 'Erreur interne' }, 500);
});

// ---------- Authentification ----------
app.post('/auth/login', async (c) => {
  const body = obj(await c.req.json().catch(() => null));
  const email = str(body.email, 'email').toLowerCase();
  const password = str(body.password, 'mot de passe', { max: 200 });
  const user = await c.env.DB.prepare('SELECT id, password_hash FROM users WHERE email = ?').bind(email).first<{ id: string; password_hash: string }>();
  // Même réponse que l'email existe ou non (pas d'énumération de comptes)
  if (!user || !(await verifyPassword(password, user.password_hash))) bad('Email ou mot de passe incorrect');
  await openSession(c, user!.id, 7);
  return c.json({ ok: true });
});

/** Crée une boulangerie de démonstration isolée, propre à ce visiteur. */
app.post('/auth/demo', async (c) => {
  const body = obj(await c.req.json().catch(() => ({})));
  const role = body.role ? oneOf(body.role, 'rôle', ROLES) : 'patron';
  const db = c.env.DB;
  const bakeryId = crypto.randomUUID();
  const tag = bakeryId.slice(0, 8);
  const unusable = await hashPassword(crypto.randomUUID()); // personne ne connaît ce mot de passe
  const people: [Role, string][] = [['patron', 'Camille Lefebvre'], ['chef', 'Hugo Delattre'], ['vendeur', 'Inès Caron']];
  const ids = Object.fromEntries(people.map(([r]) => [r, crypto.randomUUID()])) as Record<Role, string>;
  await db.batch([
    db.prepare('INSERT INTO bakeries (id, name, is_demo, target_coef) VALUES (?, ?, 1, 3.5)').bind(bakeryId, 'Maison Fournil — Wimereux'),
    ...people.map(([r, name]) => db.prepare('INSERT INTO users (id, bakery_id, email, name, role, password_hash) VALUES (?,?,?,?,?,?)')
      .bind(ids[r], bakeryId, `${r}-${tag}@demo.fournil`, name, r, unusable)),
  ]);
  await insertSeed(db, bakeryId);
  await openSession(c, ids[role], 1);
  return c.json({ ok: true });
});

/** État de session sans erreur 401 (utilisé au chargement de l'appli). */
app.get('/session', async (c) => c.json({ me: await currentUser(c) }));

app.post('/auth/logout', async (c) => { await closeSession(c); return c.json({ ok: true }); });

// ---------- Routes protégées ----------
app.use('/me', requireAuth);
app.use('/catalog', requireAuth);
app.use('/bakery', requireAuth);
app.use('/ingredients/*', requireAuth);
app.use('/ingredients', requireAuth);
app.use('/recipes/*', requireAuth);
app.use('/recipes', requireAuth);
app.use('/products/*', requireAuth);
app.use('/products', requireAuth);
app.use('/auth/switch-role', requireAuth);

app.get('/me', (c) => c.json(c.get('me')));

/** En démo, passer d'un rôle à l'autre pour voir ce que chacun voit. */
app.post('/auth/switch-role', async (c) => {
  const me = c.get('me');
  if (!me.isDemo) throw new HTTPException(403, { message: 'Disponible uniquement en démonstration' });
  const role = oneOf(obj(await c.req.json()).role, 'rôle', ROLES);
  const u = await c.env.DB.prepare('SELECT id FROM users WHERE bakery_id = ? AND role = ? LIMIT 1').bind(me.bakeryId, role).first<{ id: string }>();
  if (!u) bad('Aucun utilisateur pour ce rôle');
  await closeSession(c);
  await openSession(c, u!.id, 1);
  return c.json({ ok: true });
});

app.get('/catalog', async (c) => {
  const me = c.get('me');
  return c.json(await loadCatalog(c.env.DB, me.bakeryId, me.role));
});

app.put('/bakery', allow('patron'), async (c) => {
  const b = obj(await c.req.json());
  await c.env.DB.prepare('UPDATE bakeries SET name = ?, target_coef = ? WHERE id = ?')
    .bind(str(b.name, 'nom'), num(b.targetCoef, 'coefficient', { min: 1, max: 10 }), c.get('me').bakeryId).run();
  return c.json({ ok: true });
});

// ---------- Ingrédients ----------
function parseIngredient(b: Record<string, unknown>) {
  return {
    name: str(b.name, 'nom'),
    unit: oneOf(b.unit, 'unité', ['kg', 'L', 'piece'] as const),
    priceCents: Math.round(num(b.priceCents, 'prix', { min: 0, max: 1_000_000 })),
    supplier: typeof b.supplier === 'string' ? b.supplier.trim().slice(0, 120) : '',
    allergens: allergens(b.allergens ?? []),
  };
}

app.get('/ingredients/:id/history', allow('patron', 'chef'), async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT h.price_cents AS priceCents, h.changed_at AS changedAt FROM price_history h
       JOIN ingredients i ON i.id = h.ingredient_id WHERE i.id = ? AND i.bakery_id = ? ORDER BY h.changed_at`,
  ).bind(c.req.param('id'), c.get('me').bakeryId).all();
  return c.json(rows.results);
});

app.post('/ingredients', allow('patron', 'chef'), async (c) => {
  const i = parseIngredient(obj(await c.req.json()));
  const id = crypto.randomUUID();
  const db = c.env.DB;
  await db.batch([
    db.prepare('INSERT INTO ingredients (id, bakery_id, name, unit, price_cents, supplier, allergens) VALUES (?,?,?,?,?,?,?)')
      .bind(id, c.get('me').bakeryId, i.name, i.unit, i.priceCents, i.supplier, JSON.stringify(i.allergens)),
    db.prepare('INSERT INTO price_history (ingredient_id, price_cents) VALUES (?, ?)').bind(id, i.priceCents),
  ]);
  return c.json({ id }, 201);
});

app.put('/ingredients/:id', allow('patron', 'chef'), async (c) => {
  const i = parseIngredient(obj(await c.req.json()));
  const id = c.req.param('id');
  const db = c.env.DB;
  const current = await db.prepare('SELECT price_cents, unit FROM ingredients WHERE id = ? AND bakery_id = ?')
    .bind(id, c.get('me').bakeryId).first<{ price_cents: number; unit: string }>();
  if (!current) throw new HTTPException(404, { message: 'Ingrédient introuvable' });
  if (current.unit !== i.unit) {
    const used = await db.prepare('SELECT COUNT(*) AS n FROM recipe_lines WHERE ingredient_id = ?').bind(id).first<{ n: number }>();
    if (used && used.n > 0) bad('Impossible de changer l’unité d’un ingrédient déjà utilisé dans des recettes');
  }
  const stmts = [db.prepare(`UPDATE ingredients SET name = ?, unit = ?, price_cents = ?, supplier = ?, allergens = ?, updated_at = datetime('now') WHERE id = ?`)
    .bind(i.name, i.unit, i.priceCents, i.supplier, JSON.stringify(i.allergens), id)];
  if (current.price_cents !== i.priceCents) stmts.push(db.prepare('INSERT INTO price_history (ingredient_id, price_cents) VALUES (?, ?)').bind(id, i.priceCents));
  await db.batch(stmts);
  return c.json({ ok: true });
});

app.delete('/ingredients/:id', allow('patron', 'chef'), async (c) => {
  const id = c.req.param('id');
  const used = await c.env.DB.prepare(
    `SELECT r.name FROM recipe_lines l JOIN recipes r ON r.id = l.recipe_id WHERE l.ingredient_id = ? AND r.bakery_id = ? LIMIT 3`,
  ).bind(id, c.get('me').bakeryId).all<{ name: string }>();
  if (used.results.length) throw new HTTPException(409, { message: `Utilisé dans : ${used.results.map((r) => r.name).join(', ')}` });
  await c.env.DB.prepare('DELETE FROM ingredients WHERE id = ? AND bakery_id = ?').bind(id, c.get('me').bakeryId).run();
  return c.json({ ok: true });
});

// ---------- Recettes ----------
async function parseRecipe(c: { env: { DB: D1Database }; get: (k: 'me') => { bakeryId: string; role: Role } }, b: Record<string, unknown>, recipeId: string) {
  const catalog = await loadCatalog(c.env.DB, c.get('me').bakeryId, 'patron');
  const idx = buildIndex(catalog);
  if (!Array.isArray(b.lines) || b.lines.length === 0) bad('Une recette doit contenir au moins une ligne');
  if ((b.lines as unknown[]).length > 60) bad('60 lignes maximum');
  const lines: RecipeLine[] = (b.lines as unknown[]).map((raw, i) => {
    const l = obj(raw);
    const ingredientId = typeof l.ingredientId === 'string' ? l.ingredientId : null;
    const subrecipeId = typeof l.subrecipeId === 'string' ? l.subrecipeId : null;
    if ((ingredientId === null) === (subrecipeId === null)) bad(`Ligne ${i + 1} : choisir un ingrédient ou une sous-recette`);
    if (ingredientId && !idx.ingredients.has(ingredientId)) bad(`Ligne ${i + 1} : ingrédient inconnu`);
    if (subrecipeId && !idx.recipes.has(subrecipeId)) bad(`Ligne ${i + 1} : sous-recette inconnue`);
    const line: RecipeLine = {
      id: crypto.randomUUID(), ingredientId, subrecipeId,
      qty: num(l.qty, `Ligne ${i + 1} quantité`, { min: 0, exclusiveMin: true, max: 100_000 }),
      unit: oneOf(l.unit, `Ligne ${i + 1} unité`, ['g', 'kg', 'ml', 'L', 'piece'] as const),
    };
    const target = ingredientId ? idx.ingredients.get(ingredientId)!.unit : idx.recipes.get(subrecipeId!)!.yieldUnit;
    try { toBaseQty(line.qty, line.unit, target); } catch (e) { if (e instanceof UnitError) bad(`Ligne ${i + 1} : ${e.message}`); throw e; }
    return line;
  });
  const cycle = findCycle(recipeId, lines, idx);
  if (cycle) bad(`Recette circulaire : ${cycle.join(' → ')}`);
  return {
    name: str(b.name, 'nom'),
    category: oneOf(b.category ?? 'base', 'catégorie', ['base', 'assemblage'] as const),
    yieldQty: num(b.yieldQty, 'rendement', { min: 0, exclusiveMin: true, max: 100_000 }),
    yieldUnit: oneOf(b.yieldUnit, 'unité de rendement', ['kg', 'piece'] as const),
    lossPct: num(b.lossPct ?? 0, 'pertes', { min: 0, max: 90 }),
    notes: typeof b.notes === 'string' ? b.notes.slice(0, 2000) : '',
    lines,
    current: idx.recipes.get(recipeId),
    usedBy: catalog.recipes.filter((r) => r.lines.some((l) => l.subrecipeId === recipeId)).length + catalog.products.filter((p) => p.recipeId === recipeId).length,
  };
}

function lineStatements(db: D1Database, recipeId: string, lines: RecipeLine[]) {
  return lines.map((l, pos) => db.prepare('INSERT INTO recipe_lines (id, recipe_id, ingredient_id, subrecipe_id, qty, unit, position) VALUES (?,?,?,?,?,?,?)')
    .bind(l.id, recipeId, l.ingredientId, l.subrecipeId, l.qty, l.unit, pos));
}

app.post('/recipes', allow('patron', 'chef'), async (c) => {
  const id = crypto.randomUUID();
  const r = await parseRecipe(c, obj(await c.req.json()), id);
  const db = c.env.DB;
  await db.batch([
    db.prepare('INSERT INTO recipes (id, bakery_id, name, category, yield_qty, yield_unit, loss_pct, notes) VALUES (?,?,?,?,?,?,?,?)')
      .bind(id, c.get('me').bakeryId, r.name, r.category, r.yieldQty, r.yieldUnit, r.lossPct, r.notes),
    ...lineStatements(db, id, r.lines),
  ]);
  return c.json({ id }, 201);
});

app.put('/recipes/:id', allow('patron', 'chef'), async (c) => {
  const id = c.req.param('id');
  const r = await parseRecipe(c, obj(await c.req.json()), id);
  if (!r.current) throw new HTTPException(404, { message: 'Recette introuvable' });
  if (r.current.yieldUnit !== r.yieldUnit && r.usedBy > 0) bad('Impossible de changer l’unité de rendement d’une recette déjà utilisée');
  const db = c.env.DB;
  await db.batch([
    db.prepare(`UPDATE recipes SET name = ?, category = ?, yield_qty = ?, yield_unit = ?, loss_pct = ?, notes = ?, updated_at = datetime('now') WHERE id = ?`)
      .bind(r.name, r.category, r.yieldQty, r.yieldUnit, r.lossPct, r.notes, id),
    db.prepare('DELETE FROM recipe_lines WHERE recipe_id = ?').bind(id),
    ...lineStatements(db, id, r.lines),
  ]);
  return c.json({ ok: true });
});

app.delete('/recipes/:id', allow('patron', 'chef'), async (c) => {
  const id = c.req.param('id');
  const me = c.get('me');
  const [subs, prods] = await c.env.DB.batch<{ name: string }>([
    c.env.DB.prepare('SELECT r.name FROM recipe_lines l JOIN recipes r ON r.id = l.recipe_id WHERE l.subrecipe_id = ? AND r.bakery_id = ? LIMIT 3').bind(id, me.bakeryId),
    c.env.DB.prepare('SELECT name FROM products WHERE recipe_id = ? AND bakery_id = ? LIMIT 3').bind(id, me.bakeryId),
  ]);
  const users = [...subs!.results, ...prods!.results].map((x) => x.name);
  if (users.length) throw new HTTPException(409, { message: `Utilisée par : ${users.join(', ')}` });
  await c.env.DB.prepare('DELETE FROM recipes WHERE id = ? AND bakery_id = ?').bind(id, me.bakeryId).run();
  return c.json({ ok: true });
});

// ---------- Produits ----------
async function parseProduct(db: D1Database, bakeryId: string, b: Record<string, unknown>) {
  const recipeId = str(b.recipeId, 'recette', { max: 64 });
  const ok = await db.prepare('SELECT 1 FROM recipes WHERE id = ? AND bakery_id = ?').bind(recipeId, bakeryId).first();
  if (!ok) bad('Recette inconnue');
  return {
    name: str(b.name, 'nom'), recipeId,
    portionQty: num(b.portionQty, 'portion', { min: 0, exclusiveMin: true, max: 10_000 }),
    priceCents: Math.round(num(b.priceCents, 'prix', { min: 0, max: 1_000_000 })),
    vatRate: oneOf(String(b.vatRate ?? '5.5'), 'TVA', ['5.5', '10', '20'] as const),
    active: b.active === false ? 0 : 1,
  };
}

app.post('/products', allow('patron'), async (c) => {
  const p = await parseProduct(c.env.DB, c.get('me').bakeryId, obj(await c.req.json()));
  const id = crypto.randomUUID();
  await c.env.DB.prepare('INSERT INTO products (id, bakery_id, name, recipe_id, portion_qty, price_cents, vat_rate, active) VALUES (?,?,?,?,?,?,?,?)')
    .bind(id, c.get('me').bakeryId, p.name, p.recipeId, p.portionQty, p.priceCents, Number(p.vatRate), p.active).run();
  return c.json({ id }, 201);
});

app.put('/products/:id', allow('patron'), async (c) => {
  const p = await parseProduct(c.env.DB, c.get('me').bakeryId, obj(await c.req.json()));
  const res = await c.env.DB.prepare(`UPDATE products SET name = ?, recipe_id = ?, portion_qty = ?, price_cents = ?, vat_rate = ?, active = ?, updated_at = datetime('now') WHERE id = ? AND bakery_id = ?`)
    .bind(p.name, p.recipeId, p.portionQty, p.priceCents, Number(p.vatRate), p.active, c.req.param('id'), c.get('me').bakeryId).run();
  if (!res.meta.changes) throw new HTTPException(404, { message: 'Produit introuvable' });
  return c.json({ ok: true });
});

app.delete('/products/:id', allow('patron'), async (c) => {
  await c.env.DB.prepare('DELETE FROM products WHERE id = ? AND bakery_id = ?').bind(c.req.param('id'), c.get('me').bakeryId).run();
  return c.json({ ok: true });
});

app.all('*', (c) => c.json({ error: 'Route inconnue' }, 404));

export default {
  fetch: app.fetch,
  /** Tâche planifiée : supprime les démos de plus de 24 h et les sessions expirées. */
  async scheduled(_event: ScheduledController, env: Env['Bindings']) {
    // Ordre explicite : les lignes de recette bloquent (RESTRICT) la suppression des ingrédients.
    const old = `SELECT id FROM bakeries WHERE is_demo = 1 AND created_at < datetime('now', '-1 day')`;
    await env.DB.batch([
      env.DB.prepare(`DELETE FROM products WHERE bakery_id IN (${old})`),
      env.DB.prepare(`DELETE FROM recipe_lines WHERE recipe_id IN (SELECT id FROM recipes WHERE bakery_id IN (${old}))`),
      env.DB.prepare(`DELETE FROM recipes WHERE bakery_id IN (${old})`),
      env.DB.prepare(`DELETE FROM bakeries WHERE id IN (${old})`),
      env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(new Date().toISOString()),
    ]);
  },
} satisfies ExportedHandler<Env['Bindings']>;
