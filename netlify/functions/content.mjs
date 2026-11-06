import { store } from '../lib/stores.mjs';
import { json, fail, sameOriginRequest } from '../lib/http.mjs';
import { isAdmin } from '../lib/session.mjs';
import { CONTENT_KEY, ContentError, validateContent } from '../lib/content.mjs';

const MAX_BACKUPS = 300;

// GET  /.netlify/functions/content            → 공개 콘텐츠 (저장소가 비어 있으면 { empty: true })
// GET  /.netlify/functions/content?backups=1  → (관리자) 자동 백업 목록
// GET  /.netlify/functions/content?backup=KEY → (관리자) 특정 백업 내용
// POST /.netlify/functions/content            → (관리자) 전체 콘텐츠 저장. 저장 직전 상태를 자동 백업.
export default async (req, context) => {
  const contentStore = store(context, 'content');
  const backups = store(context, 'backups');
  const url = new URL(req.url);

  if (req.method === 'GET') {
    if (url.searchParams.has('backups') || url.searchParams.has('backup')) {
      if (!isAdmin(req)) return fail('관리자 로그인이 필요합니다.', 401);
      const key = url.searchParams.get('backup');
      if (key) {
        const b = await backups.get(key, { type: 'json' });
        return b ? json(b) : fail('백업을 찾을 수 없습니다.', 404);
      }
      const { blobs } = await backups.list();
      return json({ backups: blobs.map((b) => b.key).sort().reverse() });
    }
    const current = await contentStore.get(CONTENT_KEY, { type: 'json' });
    // 저장소가 비어 있으면 아무것도 만들지 않고 알려만 줍니다. (홈페이지는 내장된 기존 스냅샷을 표시)
    return current ? json(current) : json({ empty: true });
  }

  if (req.method !== 'POST') return fail('지원하지 않는 요청입니다.', 405);
  if (!sameOriginRequest(req)) return fail('허용되지 않은 요청입니다.', 403);
  if (!isAdmin(req)) return fail('관리자 로그인이 필요합니다. 다시 로그인해 주세요.', 401);

  let body;
  try { body = await req.json(); } catch { return fail('요청 형식이 올바르지 않습니다.'); }
  let clean;
  try { clean = validateContent(body); } catch (err) {
    if (err instanceof ContentError) return fail(err.message);
    throw err;
  }

  const existing = await contentStore.getWithMetadata(CONTENT_KEY, { type: 'json' });
  const currentRev = existing?.data?._rev || 0;
  if (existing && (body._rev || 0) !== currentRev)
    return fail('다른 곳에서 먼저 수정된 내용이 있습니다. 새로고침 후 다시 시도해 주세요. (데이터 보호를 위해 저장하지 않았습니다.)', 409);

  // 1) 변경 전 상태 백업 (기존 데이터가 있을 때만)
  if (existing?.data) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    await backups.setJSON(`content-${stamp}-rev${currentRev}`, existing.data);
  }

  // 2) 조건부 저장: 그 사이 다른 저장이 끼어들면 덮어쓰지 않음
  const next = { ...clean, _rev: currentRev + 1, _updatedAt: new Date().toISOString() };
  const result = existing
    ? await contentStore.setJSON(CONTENT_KEY, next, { onlyIfMatch: existing.etag })
    : await contentStore.setJSON(CONTENT_KEY, next, { onlyIfNew: true });
  if (result && result.modified === false)
    return fail('동시에 다른 저장이 진행되었습니다. 새로고침 후 다시 시도해 주세요.', 409);

  // 3) 오래된 자동 백업 정리 (최근 300개 유지)
  try {
    const { blobs } = await backups.list();
    const keys = blobs.map((b) => b.key).sort();
    for (const k of keys.slice(0, Math.max(0, keys.length - MAX_BACKUPS))) await backups.delete(k);
  } catch { /* 정리 실패는 저장 결과에 영향 없음 */ }

  return json({ content: next });
};
