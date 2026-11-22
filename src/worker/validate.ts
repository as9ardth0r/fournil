// Validation minimaliste des corps de requête (sans dépendance).
import { HTTPException } from 'hono/http-exception';
import { ALLERGEN_CODES } from '../shared/allergens';

export const bad = (message: string): never => { throw new HTTPException(400, { message }); };

export function str(v: unknown, field: string, { min = 1, max = 120 } = {}): string {
  if (typeof v !== 'string') return bad(`${field} : texte attendu`);
  const s = v.trim();
  if (s.length < min || s.length > max) bad(`${field} : entre ${min} et ${max} caractères`);
  return s;
}
export function num(v: unknown, field: string, { min = -Infinity, max = Infinity, exclusiveMin = false } = {}): number {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) return bad(`${field} : nombre attendu`);
  if (exclusiveMin ? n <= min : n < min) bad(`${field} : doit être ${exclusiveMin ? 'supérieur' : 'au moins égal'} à ${min}`);
  if (n > max) bad(`${field} : au plus ${max}`);
  return n;
}
export function oneOf<T extends string>(v: unknown, field: string, values: readonly T[]): T {
  if (!values.includes(v as T)) bad(`${field} : valeur parmi ${values.join(', ')}`);
  return v as T;
}
export function allergens(v: unknown): string[] {
  if (!Array.isArray(v)) return bad('allergènes : liste attendue');
  const set = [...new Set(v)];
  if (!set.every((a) => typeof a === 'string' && ALLERGEN_CODES.includes(a))) bad('allergènes : code inconnu');
  return set as string[];
}
export const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : bad('Corps JSON attendu');
