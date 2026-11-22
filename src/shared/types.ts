export type Role = 'patron' | 'chef' | 'vendeur';
export type IngredientUnit = 'kg' | 'L' | 'piece';
export type LineUnit = 'g' | 'kg' | 'ml' | 'L' | 'piece';
export type YieldUnit = 'kg' | 'piece';

export interface Ingredient {
  id: string;
  name: string;
  unit: IngredientUnit;
  /** Prix HT par unité, en centimes. Absent pour le rôle vendeur. */
  priceCents?: number;
  supplier: string;
  allergens: string[];
  updatedAt: string;
}

export interface RecipeLine {
  id: string;
  ingredientId: string | null;
  subrecipeId: string | null;
  qty: number;
  unit: LineUnit;
}

export interface Recipe {
  id: string;
  name: string;
  category: 'base' | 'assemblage';
  yieldQty: number;
  yieldUnit: YieldUnit;
  lossPct: number;
  notes: string;
  lines: RecipeLine[];
  updatedAt: string;
}

export interface Product {
  id: string;
  name: string;
  recipeId: string;
  portionQty: number;
  priceCents: number;
  vatRate: number;
  active: boolean;
}

export interface Catalog {
  bakery: { id: string; name: string; isDemo: boolean; targetCoef: number };
  ingredients: Ingredient[];
  recipes: Recipe[];
  products: Product[];
}

export interface Me {
  id: string;
  name: string;
  email: string;
  role: Role;
  bakeryId: string;
  bakeryName: string;
  isDemo: boolean;
}
