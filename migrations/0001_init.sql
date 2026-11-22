-- Fournil : schéma initial (Cloudflare D1 / SQLite)
PRAGMA foreign_keys = ON;

CREATE TABLE bakeries (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  is_demo     INTEGER NOT NULL DEFAULT 0,
  target_coef REAL NOT NULL DEFAULT 3.0,      -- coefficient multiplicateur visé (prix HT / coût)
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  bakery_id     TEXT NOT NULL REFERENCES bakeries(id) ON DELETE CASCADE,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('patron', 'chef', 'vendeur')),
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_users_bakery ON users(bakery_id);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,               -- SHA-256 du jeton, jamais le jeton en clair
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TABLE ingredients (
  id          TEXT PRIMARY KEY,
  bakery_id   TEXT NOT NULL REFERENCES bakeries(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  unit        TEXT NOT NULL CHECK (unit IN ('kg', 'L', 'piece')),
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),   -- prix HT par unité
  supplier    TEXT NOT NULL DEFAULT '',
  allergens   TEXT NOT NULL DEFAULT '[]',                  -- JSON : codes INCO
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_ingredients_bakery ON ingredients(bakery_id);

CREATE TABLE price_history (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ingredient_id TEXT NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  price_cents   INTEGER NOT NULL,
  changed_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_price_history_ing ON price_history(ingredient_id, changed_at);

CREATE TABLE recipes (
  id         TEXT PRIMARY KEY,
  bakery_id  TEXT NOT NULL REFERENCES bakeries(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  category   TEXT NOT NULL DEFAULT 'base' CHECK (category IN ('base', 'assemblage')),
  yield_qty  REAL NOT NULL CHECK (yield_qty > 0),
  yield_unit TEXT NOT NULL CHECK (yield_unit IN ('kg', 'piece')),
  loss_pct   REAL NOT NULL DEFAULT 0 CHECK (loss_pct >= 0 AND loss_pct < 100),
  notes      TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_recipes_bakery ON recipes(bakery_id);

CREATE TABLE recipe_lines (
  id            TEXT PRIMARY KEY,
  recipe_id     TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  ingredient_id TEXT REFERENCES ingredients(id) ON DELETE RESTRICT,
  subrecipe_id  TEXT REFERENCES recipes(id) ON DELETE RESTRICT,
  qty           REAL NOT NULL CHECK (qty > 0),
  unit          TEXT NOT NULL CHECK (unit IN ('g', 'kg', 'ml', 'L', 'piece')),
  position      INTEGER NOT NULL DEFAULT 0,
  CHECK ((ingredient_id IS NULL) <> (subrecipe_id IS NULL))
);
CREATE INDEX idx_lines_recipe ON recipe_lines(recipe_id);

CREATE TABLE products (
  id          TEXT PRIMARY KEY,
  bakery_id   TEXT NOT NULL REFERENCES bakeries(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  recipe_id   TEXT NOT NULL REFERENCES recipes(id) ON DELETE RESTRICT,
  portion_qty REAL NOT NULL CHECK (portion_qty > 0),        -- dans l'unité de rendement de la recette
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),    -- prix de vente TTC
  vat_rate    REAL NOT NULL DEFAULT 5.5,
  active      INTEGER NOT NULL DEFAULT 1,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_products_bakery ON products(bakery_id);
