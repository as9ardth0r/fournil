import { useData } from '../store';
import { ALLERGENS } from '../../shared/allergens';
import { PageHead } from '../ui';

/** Tableau produits × 14 allergènes, à afficher en boutique (obligation d'information du consommateur). */
export default function AllergenMatrix() {
  const { catalog, derived } = useData();
  const products = catalog.products.filter((p) => p.active);
  const used = ALLERGENS.filter((a) => products.some((p) => derived.allergens(p.recipeId).has(a.code)));
  const absent = ALLERGENS.filter((a) => !used.includes(a));

  return (
    <>
      <PageHead kicker="Information du consommateur" title="Classeur allergènes"
        actions={<button className="btn ghost" onClick={() => window.print()}>Imprimer pour la boutique</button>}>
        Calculé à partir des fiches techniques : il se met à jour tout seul quand une recette change.
      </PageHead>
      <section className="card flush matrix-wrap">
        <table className="matrix">
          <thead>
            <tr><th>Produit</th>{used.map((a) => <th key={a.code}><span>{a.short}</span></th>)}</tr>
          </thead>
          <tbody>
            {products.map((p) => {
              const set = derived.allergens(p.recipeId);
              return (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  {used.map((a) => <td key={a.code} className={set.has(a.code) ? 'yes' : ''}>{set.has(a.code) ? '●' : ''}</td>)}
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      <p className="muted small">Absents de toute la gamme : {absent.map((a) => a.short).join(', ')}. Les risques de contamination croisée de l’atelier doivent être signalés séparément.</p>
    </>
  );
}
