// Les 14 allergènes à déclaration obligatoire (règlement UE n° 1169/2011, dit « INCO »).
export const ALLERGENS = [
  { code: 'gluten',     label: 'Céréales contenant du gluten', short: 'Gluten' },
  { code: 'crustaces',  label: 'Crustacés',                    short: 'Crustacés' },
  { code: 'oeufs',      label: 'Œufs',                         short: 'Œufs' },
  { code: 'poissons',   label: 'Poissons',                     short: 'Poissons' },
  { code: 'arachides',  label: 'Arachides',                    short: 'Arachides' },
  { code: 'soja',       label: 'Soja',                         short: 'Soja' },
  { code: 'lait',       label: 'Lait',                         short: 'Lait' },
  { code: 'fruits_coque', label: 'Fruits à coque',             short: 'Fruits à coque' },
  { code: 'celeri',     label: 'Céleri',                       short: 'Céleri' },
  { code: 'moutarde',   label: 'Moutarde',                     short: 'Moutarde' },
  { code: 'sesame',     label: 'Graines de sésame',            short: 'Sésame' },
  { code: 'sulfites',   label: 'Anhydride sulfureux et sulfites', short: 'Sulfites' },
  { code: 'lupin',      label: 'Lupin',                        short: 'Lupin' },
  { code: 'mollusques', label: 'Mollusques',                   short: 'Mollusques' },
] as const;

export type AllergenCode = (typeof ALLERGENS)[number]['code'];
export const ALLERGEN_CODES: readonly string[] = ALLERGENS.map((a) => a.code);
export const allergenLabel = (code: string) => ALLERGENS.find((a) => a.code === code)?.short ?? code;
