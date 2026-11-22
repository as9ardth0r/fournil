// Authentification : mots de passe PBKDF2 (WebCrypto) et sessions par cookie HttpOnly.
// Le jeton de session n'est jamais stocké en clair : seule son empreinte SHA-256 est en base.

import type { Context, MiddlewareHandler } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { HTTPException } from 'hono/http-exception';
import type { Me, Role } from '../shared/types';

export type Env = { Bindings: { DB: D1Database }; Variables: { me: Me } };

const COOKIE = 'fournil_session';
const ITERATIONS = 100_000; // maximum accepté par WebCrypto sur Workers
const enc = new TextEncoder();
const b64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function pbkdf2(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${ITERATIONS}$${b64(salt)}$${b64(await pbkdf2(password, salt, ITERATIONS))}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [scheme, iter, salt, hash] = stored.split('$');
  if (scheme !== 'pbkdf2' || !iter || !salt || !hash) return false;
  const candidate = new Uint8Array(await pbkdf2(password, unb64(salt), Number(iter)));
  const expected = unb64(hash);
  if (candidate.length !== expected.length) return false;
  let diff = 0; // comparaison à temps constant
  for (let i = 0; i < candidate.length; i++) diff |= candidate[i]! ^ expected[i]!;
  return diff === 0;
}

const sha256 = async (s: string) => b64(await crypto.subtle.digest('SHA-256', enc.encode(s)));

export async function openSession(c: Context<Env>, userId: string, days: number) {
  const token = b64(crypto.getRandomValues(new Uint8Array(32)));
  const expires = new Date(Date.now() + days * 86_400_000);
  await c.env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(await sha256(token), userId, expires.toISOString()).run();
  setCookie(c, COOKIE, token, {
    httpOnly: true, secure: new URL(c.req.url).protocol === 'https:', sameSite: 'Lax', path: '/', expires,
  });
}

export async function closeSession(c: Context<Env>) {
  const token = getCookie(c, COOKIE);
  if (token) await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run();
  deleteCookie(c, COOKIE, { path: '/' });
}

/** Utilisateur de la session courante, ou null. */
export async function currentUser(c: Context<Env>): Promise<Me | null> {
  const token = getCookie(c, COOKIE);
  if (!token) return null;
  const row = await c.env.DB.prepare(
    `SELECT u.id, u.name, u.email, u.role, u.bakery_id, b.name AS bakery_name, b.is_demo
       FROM sessions s JOIN users u ON u.id = s.user_id JOIN bakeries b ON b.id = u.bakery_id
      WHERE s.token_hash = ? AND s.expires_at > ?`,
  ).bind(await sha256(token), new Date().toISOString()).first<Record<string, string | number>>();
  if (!row) return null;
  return {
    id: String(row.id), name: String(row.name), email: String(row.email), role: row.role as Role,
    bakeryId: String(row.bakery_id), bakeryName: String(row.bakery_name), isDemo: row.is_demo === 1,
  };
}

/** Charge l'utilisateur connecté ; 401 sinon. */
export const requireAuth: MiddlewareHandler<Env> = async (c, next) => {
  const me = await currentUser(c);
  if (!me) throw new HTTPException(401, { message: 'Session expirée ou absente' });
  c.set('me', me);
  await next();
};

/** Restreint une route à certains rôles. */
export const allow = (...roles: Role[]): MiddlewareHandler<Env> => async (c, next) => {
  if (!roles.includes(c.get('me').role)) throw new HTTPException(403, { message: 'Action réservée : ' + roles.join(', ') });
  await next();
};
