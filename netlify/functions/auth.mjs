import { createHash } from 'node:crypto';
import { store } from '../lib/stores.mjs';
import { json, fail, sameOriginRequest } from '../lib/http.mjs';
import { configured, isAdmin, passwordMatches, sessionCookie, clearCookie } from '../lib/session.mjs';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 10;

// GET  /.netlify/functions/auth                       → { configured, loggedIn }
// POST /.netlify/functions/auth {action:'login',password} / {action:'logout'}
export default async (req, context) => {
  if (req.method === 'GET') return json({ configured: configured(), loggedIn: isAdmin(req) });
  if (req.method !== 'POST') return fail('지원하지 않는 요청입니다.', 405);
  if (!sameOriginRequest(req)) return fail('허용되지 않은 요청입니다.', 403);

  let body;
  try { body = await req.json(); } catch { return fail('요청 형식이 올바르지 않습니다.'); }

  if (body?.action === 'logout') return json({ ok: true }, 200, { 'Set-Cookie': clearCookie() });
  if (body?.action !== 'login') return fail('알 수 없는 요청입니다.');
  if (!configured()) return fail('서버 관리자 설정이 필요합니다. Netlify 환경 변수 ADMIN_PASSWORD, ADMIN_SESSION_SECRET을 설정해 주세요.', 503);

  const auth = store(context, 'auth');
  const key = 'fail-' + createHash('sha256').update(String(context.ip || 'unknown')).digest('hex').slice(0, 32);
  const now = Date.now();
  let record = (await auth.get(key, { type: 'json' })) || null;
  if (record && now - record.first > WINDOW_MS) record = null;
  if (record && record.count >= MAX_FAILS) return fail('로그인 시도가 너무 많습니다. 15분 후 다시 시도해 주세요.', 429);

  if (!passwordMatches(body.password)) {
    await auth.setJSON(key, { first: record?.first || now, count: (record?.count || 0) + 1 });
    await new Promise((r) => setTimeout(r, 600));
    return fail('비밀번호가 올바르지 않습니다.', 401);
  }
  if (record) await auth.delete(key);
  return json({ ok: true, loggedIn: true }, 200, { 'Set-Cookie': sessionCookie() });
};
