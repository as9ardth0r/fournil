import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ApiError } from './api';
import type { Catalog, Me, Product } from '../shared/types';
import { buildIndex, createAllergenResolver, createCostCalculator, productEconomics, type Economics, type Index, type RecipeCost } from '../shared/domain';

export interface Derived {
  idx: Index;
  cost: (recipeId: string) => RecipeCost;
  allergens: (recipeId: string) => Set<string>;
  econ: Map<string, Economics>;
}

/** Calculs dérivés d'un catalogue, réutilisés partout (et par le simulateur sur un catalogue modifié). */
export function derive(catalog: Catalog): Derived {
  const idx = buildIndex(catalog);
  const cost = createCostCalculator(idx);
  const allergens = createAllergenResolver(idx);
  const econ = new Map(catalog.products.map((p: Product) => [p.id, productEconomics(p, cost, catalog.bakery.targetCoef)]));
  return { idx, cost, allergens, econ };
}

interface Store {
  me: Me | null;
  catalog: Catalog | null;
  derived: Derived | null;
  loading: boolean;
  reload: () => Promise<void>;
  refreshMe: () => Promise<void>;
  can: { editCatalog: boolean; editProducts: boolean; seeCosts: boolean };
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => { setCatalog(await api.get<Catalog>('/catalog')); }, []);
  const refreshMe = useCallback(async () => {
    try {
      const { me: m } = await api.get<{ me: Me | null }>('/session');
      setMe(m);
      setCatalog(m ? await api.get<Catalog>('/catalog') : null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) { setMe(null); setCatalog(null); } else throw e;
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void refreshMe(); }, [refreshMe]);

  const derived = useMemo(() => (catalog ? derive(catalog) : null), [catalog]);
  const role = me?.role;
  const value: Store = {
    me, catalog, derived, loading, reload, refreshMe,
    can: { editCatalog: role === 'patron' || role === 'chef', editProducts: role === 'patron', seeCosts: role !== 'vendeur' },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error('StoreProvider manquant');
  return s;
}

/** Version « prête à l'emploi » quand on est connecté et que le catalogue est chargé. */
export function useData() {
  const s = useStore();
  if (!s.me || !s.catalog || !s.derived) throw new Error('Données non chargées');
  return { ...s, me: s.me, catalog: s.catalog, derived: s.derived };
}
