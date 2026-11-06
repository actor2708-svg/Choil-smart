import { createHash } from 'node:crypto';
import { getStore } from '@netlify/blobs';

// One anonymous browser is counted at most once per day (Asia/Seoul).
// Each visit has its own immutable key, so concurrent visits do not overwrite a shared counter.
const VISITOR_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function koreanDate() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const p = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${p.year}-${p.month}-${p.day}`;
}

async function count(store, prefix) {
  let n = 0;
  for await (const page of store.list({ prefix, paginate: true })) {
    n += page.blobs.length;
    // The present approach suits a small school site. Avoid an unlimited listing if usage grows dramatically.
    if (n > 250_000) throw new Error('visitor event listing exceeded operating limit');
  }
  return n;
}

export default async function handler(request, context) {
  if (request.method !== 'GET' && request.method !== 'POST') {
    return json({ error: 'method not allowed' }, 405);
  }
  try {
    // Deploy previews must not contribute to public production statistics.
    const production = context?.deploy?.context === 'production';
    const store = getStore({
      name: production ? 'joil-visitor-events-v1' : 'test-joil-visitor-events-v1',
      consistency: 'strong',
    });
    const date = koreanDate();

    if (request.method === 'POST') {
      const origin = request.headers.get('origin');
      if (origin && origin !== new URL(request.url).origin) {
        return json({ error: 'cross-origin request rejected' }, 403);
      }
      if (!(request.headers.get('content-type') || '').includes('application/json')) {
        return json({ error: 'JSON required' }, 415);
      }
      const payload = await request.json().catch(() => null);
      const token = payload?.visitorId;
      if (typeof token !== 'string' || !VISITOR_ID.test(token)) {
        return json({ error: 'invalid visitorId' }, 400);
      }
      // Store a one-way digest instead of the browser's raw random ID.
      const digest = createHash('sha256').update(`joil-visitor-v1:${token.toLowerCase()}`).digest('hex');
      await store.set(`visits/${date}/${digest}`, '1', { onlyIfNew: true });
    }

    const [today, total] = await Promise.all([
      count(store, `visits/${date}/`),
      count(store, 'visits/'),
    ]);
    return json({ today, total, date, method: 'anonymous browser per day' });
  } catch (error) {
    console.error('visitor-stats failed:', error?.message || error);
    return json({ error: 'visitor statistics unavailable' }, 503);
  }
}
