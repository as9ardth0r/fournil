import { Link, useParams } from 'react-router-dom';
import { useData } from '../store';
import { labelIngredients } from '../../shared/domain';
import { Money } from '../ui';
import { allergenLabel } from '../../shared/allergens';

/** Étiquette produit imprimable : ingrédients par poids décroissant, allergènes en gras (règle INCO). */
export default function Label() {
  const { id } = useParams();
  const { catalog, derived } = useData();
  const p = catalog.products.find((x) => x.id === id);
  if (!p) return <p>Produit introuvable. <Link to="/produits">Retour</Link></p>;
  const items = labelIngredients(p.recipeId, derived.idx).filter((i) => i.name !== 'Eau' || i.pct >= 5);
  const allergens = derived.allergens(p.recipeId);
  const workshop = [...new Set(catalog.ingredients.flatMap((i) => i.allergens))].filter((a) => !allergens.has(a)).map(allergenLabel);

  return (
    <>
      <div className="label-actions no-print">
        <Link to="/produits" className="btn ghost">← Produits</Link>
        <button className="btn" onClick={() => window.print()}>Imprimer l’étiquette</button>
      </div>
      <article className="label-card">
        <header>
          <p className="label-shop">{catalog.bakery.name}</p>
          <h1>{p.name}</h1>
        </header>
        <p className="label-ingredients">
          <span className="label-title">Ingrédients : </span>
          {items.map((i, k) => (
            <span key={i.id}>
              {i.allergens.length ? <strong>{i.name.toLowerCase()}</strong> : i.name.toLowerCase()}
              {k < items.length - 1 ? ', ' : '.'}
            </span>
          ))}
        </p>
        <p className="label-allergens">
          <strong>Allergènes :</strong> {allergens.size ? [...allergens].map(allergenLabel).join(', ').toLowerCase() : 'aucun allergène majeur'}.
          {workshop.length > 0 && <> Peut contenir des traces de : {workshop.join(', ').toLowerCase()}.</>}
        </p>
        <footer>
          <span>À consommer de préférence le jour même</span>
          <strong className="label-price"><Money cents={p.priceCents} /></strong>
        </footer>
      </article>
      <p className="muted small no-print">Liste établie automatiquement à partir de la fiche technique (ordre pondéral, une pièce comptée 50 g). À valider avant affichage.</p>
    </>
  );
}
