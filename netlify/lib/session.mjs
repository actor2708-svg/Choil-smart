import { createHmac, createHash, timingSafeEqual } from 'node:crypto';

const COOKIE = 'joil_admin';
const MAX_AGE = 60 * 60 * 8; // 8시간

const env = (k) => (typeof Netlify !== 'undefined' ? Netlify.env.get(k) : process.env[k]) || '';

export function configured() {
  return env('ADMIN_PASSWORD').length > 0 && env('ADMIN_SESSION_SECRET').length >= 16;
}

const sign = (payload) => createHmac('sha256', env('ADMIN_SESSION_SECRET')).update(payload).digest('base64url');

function safeEqual(a, b) {
  const x = createHash('sha256').update(String(a)).digest();
  const y = createHash('sha256').update(String(b)).digest();
  return timingSafeEqual(x, y);
}

export const passwordMatches = (input) => configured() && typeof input === 'string' && safeEqual(input, env('ADMIN_PASSWORD'));

export function sessionCookie() {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
  const payload = `admin.${exp}`;
  return `${COOKIE}=${payload}.${sign(payload)}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; Secure; SameSite=Strict`;
}

export const clearCookie = () => `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;

export function isAdmin(req) {
  if (!configured()) return false;
  const raw = (req.headers.get('cookie') || '').split(/;\s*/).find((c) => c.startsWith(COOKIE + '='));
  if (!raw) return false;
  const value = raw.slice(COOKIE.length + 1);
  const i = value.lastIndexOf('.');
  if (i < 0) return false;
  const payload = value.slice(0, i), sig = value.slice(i + 1);
  const [role, exp] = payload.split('.');
  if (role !== 'admin' || !(Number(exp) > Date.now() / 1000)) return false;
  return safeEqual(sig, sign(payload));
}
