import { describe, it, expect } from 'vitest';
import { buildIndex, createCostCalculator, createAllergenResolver, findCycle, productEconomics, toBaseQty,
  UnitError, whereUsed, explode, withPriceChanges, suggestedPrice, usableYield, labelIngredients } from '../src/shared/domain';
import { buildSeed } from '../src/worker/seed';
import type { Catalog } from '../src/shared/types';

const catalog: Catalog = { bakery: { id: 'b', name: 'Test', isDemo: true, targetCoef: 3 }, ...buildSeed() };
const idx = buildIndex(catalog);
const cost = createCostCalculator(idx);
const allergens = createAllergenResolver(idx);

describe('conversions', () => {
  it('convertit grammes et millilitres', () => {
    expect(toBaseQty(250, 'g', 'kg')).toBeCloseTo(0.25);
    expect(toBaseQty(500, 'ml', 'L')).toBeCloseTo(0.5);
  });
  it('refuse les unités incompatibles', () => {
    expect(() => toBaseQty(2, 'piece', 'kg')).toThrow(UnitError);
  });
});

describe('coût de revient', () => {
  it('calcule une recette de base à la main', () => {
    // Ganache : 0,5 kg × 14,50 + 0,5 L × 4,20 + 0,05 kg × 8,40 = 9,77 € pour 1,05 kg
    const g = cost('ganache');
    expect(g.totalCents).toBeCloseTo(977, 0);
    expect(g.perUnitCents).toBeCloseTo(977 / 1.05, 1);
  });
  it('tient compte des pertes', () => {
    const f = cost('feuilletee');
    const r = idx.recipes.get('feuilletee')!;
    expect(f.perUnitCents).toBeCloseTo(f.totalCents / usableYield(r), 6);
    expect(usableYield(r)).toBeCloseTo(2.28);
  });
  it('propage le coût des sous-recettes imbriquées sur trois niveaux', () => {
    // Paris-Brest ← mousseline ← (pâtissière + praliné)
    const pb = cost('a_parisbrest');
    const mousseline = pb.lines.find((l) => l.label === 'Crème mousseline praliné')!;
    expect(mousseline.costCents).toBeCloseTo(0.9 * cost('mousseline').perUnitCents, 6);
    expect(pb.lines.reduce((s, l) => s + l.share, 0)).toBeCloseTo(1);
  });
  it('signale un coût incomplet quand un prix est masqué', () => {
    const hidden = buildIndex({ ...catalog, ingredients: catalog.ingredients.map(({ priceCents: _, ...i }) => i) });
    expect(createCostCalculator(hidden)('a_croissant').incomplete).toBe(true);
  });
});

describe('allergènes INCO', () => {
  it('remontent depuis toutes les sous-recettes', () => {
    expect([...allergens('a_parisbrest')].sort()).toEqual(['fruits_coque', 'gluten', 'lait', 'oeufs']);
    expect(allergens('a_choco').has('soja')).toBe(true);
  });
});

describe('cycles', () => {
  it('détecte une recette qui s’utiliserait elle-même indirectement', () => {
    const path = findCycle('patissiere', [{ id: 'x', ingredientId: null, subrecipeId: 'mousseline', qty: 1, unit: 'kg' }], idx);
    expect(path).toEqual(['Crème pâtissière vanille', 'Crème mousseline praliné', 'Crème pâtissière vanille']);
  });
  it('accepte une composition saine', () => {
    expect(findCycle('mousseline', idx.recipes.get('mousseline')!.lines, idx)).toBeNull();
  });
});

describe('économie des produits', () => {
  it('calcule prix HT, marge et coefficient', () => {
    const p = catalog.products.find((x) => x.name === 'Croissant')!;
    const e = productEconomics(p, cost, 3);
    expect(e.priceHtCents).toBeCloseTo(130 / 1.055, 6);
    expect(e.marginCents).toBeCloseTo(e.priceHtCents - e.costCents, 6);
    expect(e.coef).toBeGreaterThan(1);
  });
  it('propose un prix arrondi aux 10 centimes', () => {
    expect(suggestedPrice(100, 5.5, 3)).toBe(320);
  });
});

describe('impact d’une hausse de prix', () => {
  it('retrouve tous les produits touchés par le beurre de tourage', () => {
    const { productIds } = whereUsed('tourage', catalog);
    const names = catalog.products.filter((p) => productIds.includes(p.id)).map((p) => p.name).sort();
    expect(names).toEqual(['Croissant', 'Mille-feuille', 'Pain au chocolat']);
  });
  it('simule +20 % sur le chocolat sans toucher au catalogue d’origine', () => {
    const sim = withPriceChanges(catalog, { choco: 20 });
    const before = cost('ganache').totalCents;
    const after = createCostCalculator(buildIndex(sim))('ganache').totalCents;
    expect(after - before).toBeCloseTo(0.5 * 1450 * 0.2, 6);
    expect(catalog.ingredients.find((i) => i.id === 'choco')!.priceCents).toBe(1450);
  });
});

describe('étiquetage', () => {
  it('trie les ingrédients par poids décroissant et totalise 100 %', () => {
    const list = labelIngredients('a_choco', idx);
    expect(list[0]!.kg).toBeGreaterThanOrEqual(list[1]!.kg);
    expect(list.reduce((s, x) => s + x.pct, 0)).toBeCloseTo(100);
    expect(list.find((x) => x.name.startsWith('Farine'))!.allergens).toContain('gluten');
  });
});

describe('fiche de pesée', () => {
  it('éclate une fournée en ingrédients bruts', () => {
    const need = explode('a_millefeuille', 20, idx);
    expect(need.get('tourage')).toBeGreaterThan(0);
    expect(need.get('lait')).toBeGreaterThan(0);
  });
});
