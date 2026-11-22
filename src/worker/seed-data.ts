// Jeu de données de démonstration : une boulangerie-pâtisserie fictive de la Côte d'Opale.
// Les identifiants sont des alias lisibles, remplacés par des UUID à l'insertion.

type Ing = [alias: string, name: string, unit: 'kg' | 'L' | 'piece', priceEuros: number, supplier: string, allergens: string[]];
type Line = [target: string, qty: number, unit: 'g' | 'kg' | 'ml' | 'L' | 'piece'];
type Rec = { alias: string; name: string; category: 'base' | 'assemblage'; yieldQty: number; yieldUnit: 'kg' | 'piece'; lossPct: number; notes?: string; lines: Line[] };
type Prod = [name: string, recipe: string, portionQty: number, priceEuros: number];

const MINO = 'Minoterie Opale', LAIT = 'Laiterie du Boulonnais', GROS = 'Pâtisserie Nord Distribution', PRIM = 'Primeur des Halles';

export const SEED_INGREDIENTS: Ing[] = [
  ['t45', 'Farine T45 de gruau', 'kg', 0.95, MINO, ['gluten']],
  ['t55', 'Farine T55', 'kg', 0.85, MINO, ['gluten']],
  ['beurre', 'Beurre doux 82 %', 'kg', 8.4, LAIT, ['lait']],
  ['tourage', 'Beurre de tourage', 'kg', 9.8, LAIT, ['lait']],
  ['sucre', 'Sucre semoule', 'kg', 1.15, GROS, []],
  ['glace', 'Sucre glace', 'kg', 1.9, GROS, []],
  ['sel', 'Sel fin', 'kg', 0.6, GROS, []],
  ['levure', 'Levure fraîche', 'kg', 4.5, GROS, []],
  ['lait', 'Lait entier', 'L', 1.05, LAIT, ['lait']],
  ['creme', 'Crème liquide 35 %', 'L', 4.2, LAIT, ['lait']],
  ['oeuf', 'Œuf frais calibre M', 'piece', 0.28, LAIT, ['oeufs']],
  ['eau', 'Eau', 'L', 0, '', []],
  ['choco', 'Chocolat noir 70 %', 'kg', 14.5, GROS, ['soja']],
  ['batons', 'Bâtons boulangers', 'kg', 11, GROS, ['soja', 'lait']],
  ['amande', 'Poudre d’amande', 'kg', 12.8, GROS, ['fruits_coque']],
  ['noisette', 'Noisettes torréfiées', 'kg', 15.5, GROS, ['fruits_coque']],
  ['maizena', 'Amidon de maïs', 'kg', 3.2, GROS, []],
  ['vanille', 'Gousse de vanille', 'piece', 2.4, GROS, []],
  ['fraise', 'Fraises gariguettes', 'kg', 8.9, PRIM, []],
  ['fondant', 'Fondant pâtissier', 'kg', 4.1, GROS, []],
];

export const SEED_RECIPES: Rec[] = [
  { alias: 'feuilletee', name: 'Pâte feuilletée', category: 'base', yieldQty: 2.4, yieldUnit: 'kg', lossPct: 5,
    notes: 'Détrempe la veille, 6 tours simples.',
    lines: [['t45', 1000, 'g'], ['eau', 450, 'ml'], ['sel', 20, 'g'], ['beurre', 150, 'g'], ['tourage', 800, 'g']] },
  { alias: 'levee', name: 'Pâte levée feuilletée', category: 'base', yieldQty: 2.3, yieldUnit: 'kg', lossPct: 8,
    notes: '1 tour double + 1 tour simple, pousse à 26 °C.',
    lines: [['t45', 1000, 'g'], ['sucre', 120, 'g'], ['sel', 20, 'g'], ['levure', 40, 'g'], ['lait', 300, 'ml'], ['eau', 250, 'ml'], ['beurre', 80, 'g'], ['tourage', 500, 'g']] },
  { alias: 'patissiere', name: 'Crème pâtissière vanille', category: 'base', yieldQty: 1.4, yieldUnit: 'kg', lossPct: 3,
    lines: [['lait', 1, 'L'], ['oeuf', 8, 'piece'], ['sucre', 200, 'g'], ['maizena', 90, 'g'], ['beurre', 100, 'g'], ['vanille', 1, 'piece']] },
  { alias: 'sucree', name: 'Pâte sucrée amande', category: 'base', yieldQty: 1.15, yieldUnit: 'kg', lossPct: 10,
    lines: [['t55', 500, 'g'], ['beurre', 300, 'g'], ['glace', 190, 'g'], ['amande', 60, 'g'], ['oeuf', 2, 'piece'], ['sel', 2, 'g']] },
  { alias: 'amandine', name: 'Crème d’amande', category: 'base', yieldQty: 1, yieldUnit: 'kg', lossPct: 0,
    lines: [['beurre', 250, 'g'], ['sucre', 250, 'g'], ['amande', 250, 'g'], ['oeuf', 5, 'piece']] },
  { alias: 'choux', name: 'Pâte à choux', category: 'base', yieldQty: 1.4, yieldUnit: 'kg', lossPct: 10,
    lines: [['lait', 250, 'ml'], ['eau', 250, 'ml'], ['beurre', 225, 'g'], ['sel', 5, 'g'], ['sucre', 10, 'g'], ['t55', 275, 'g'], ['oeuf', 9, 'piece']] },
  { alias: 'ganache', name: 'Ganache noire 70 %', category: 'base', yieldQty: 1.05, yieldUnit: 'kg', lossPct: 0,
    lines: [['choco', 500, 'g'], ['creme', 500, 'ml'], ['beurre', 50, 'g']] },
  { alias: 'praline', name: 'Praliné noisette maison', category: 'base', yieldQty: 0.8, yieldUnit: 'kg', lossPct: 3,
    lines: [['noisette', 500, 'g'], ['sucre', 330, 'g']] },
  { alias: 'mousseline', name: 'Crème mousseline praliné', category: 'base', yieldQty: 0.95, yieldUnit: 'kg', lossPct: 0,
    lines: [['patissiere', 500, 'g'], ['beurre', 250, 'g'], ['praline', 200, 'g']] },

  { alias: 'a_croissant', name: 'Croissant (fournée)', category: 'assemblage', yieldQty: 30, yieldUnit: 'piece', lossPct: 3,
    lines: [['levee', 2.1, 'kg'], ['oeuf', 3, 'piece']] },
  { alias: 'a_pac', name: 'Pain au chocolat (fournée)', category: 'assemblage', yieldQty: 30, yieldUnit: 'piece', lossPct: 3,
    lines: [['levee', 2.1, 'kg'], ['batons', 300, 'g'], ['oeuf', 3, 'piece']] },
  { alias: 'a_millefeuille', name: 'Mille-feuille', category: 'assemblage', yieldQty: 10, yieldUnit: 'piece', lossPct: 5,
    lines: [['feuilletee', 600, 'g'], ['patissiere', 900, 'g'], ['glace', 50, 'g']] },
  { alias: 'a_eclair', name: 'Éclair au chocolat', category: 'assemblage', yieldQty: 20, yieldUnit: 'piece', lossPct: 5,
    lines: [['choux', 500, 'g'], ['patissiere', 1, 'kg'], ['choco', 100, 'g'], ['fondant', 300, 'g']] },
  { alias: 'a_parisbrest', name: 'Paris-Brest individuel', category: 'assemblage', yieldQty: 10, yieldUnit: 'piece', lossPct: 5,
    lines: [['choux', 400, 'g'], ['mousseline', 900, 'g'], ['noisette', 50, 'g'], ['glace', 20, 'g']] },
  { alias: 'a_fraises', name: 'Tartelette aux fraises', category: 'assemblage', yieldQty: 10, yieldUnit: 'piece', lossPct: 5,
    lines: [['sucree', 500, 'g'], ['amandine', 250, 'g'], ['patissiere', 400, 'g'], ['fraise', 1, 'kg']] },
  { alias: 'a_choco', name: 'Tartelette chocolat', category: 'assemblage', yieldQty: 10, yieldUnit: 'piece', lossPct: 5,
    lines: [['sucree', 500, 'g'], ['ganache', 600, 'g']] },
  { alias: 'a_financier', name: 'Financier', category: 'assemblage', yieldQty: 25, yieldUnit: 'piece', lossPct: 4,
    lines: [['beurre', 150, 'g'], ['glace', 200, 'g'], ['amande', 80, 'g'], ['t55', 60, 'g'], ['oeuf', 6, 'piece']] },
];

export const SEED_PRODUCTS: Prod[] = [
  ['Croissant', 'a_croissant', 1, 1.3],
  ['Pain au chocolat', 'a_pac', 1, 1.45],
  ['Mille-feuille', 'a_millefeuille', 1, 4.2],
  ['Éclair au chocolat', 'a_eclair', 1, 3.6],
  ['Paris-Brest', 'a_parisbrest', 1, 4.5],
  ['Tartelette aux fraises', 'a_fraises', 1, 4.6],
  ['Tartelette chocolat', 'a_choco', 1, 4.2],
  ['Financier', 'a_financier', 1, 1.2],
];

/** Historique de prix (mois en arrière, prix en euros) pour montrer l'envolée du beurre. */
export const SEED_HISTORY: Record<string, [monthsAgo: number, euros: number][]> = {
  tourage: [[11, 7.6], [8, 8.1], [5, 8.7], [2, 9.3], [0, 9.8]],
  beurre: [[11, 6.9], [7, 7.4], [3, 8.0], [0, 8.4]],
  choco: [[10, 9.8], [6, 12.2], [2, 13.9], [0, 14.5]],
  fraise: [[4, 7.5], [1, 9.4], [0, 8.9]],
  oeuf: [[10, 0.22], [6, 0.24], [3, 0.27], [0, 0.28]],
  vanille: [[11, 3.1], [6, 2.7], [0, 2.4]],
};
