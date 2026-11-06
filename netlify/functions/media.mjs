import { randomUUID } from 'node:crypto';
import { store } from '../lib/stores.mjs';
import { json, fail, sameOriginRequest } from '../lib/http.mjs';
import { isAdmin } from '../lib/session.mjs';
import { CONTENT_KEY, referencedMediaIds } from '../lib/content.mjs';

const MAX_BYTES = 3_500_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// 기존 운영 사이트: 사진을 "읽기"만 하며 절대 수정·삭제하지 않습니다.
const LEGACY_ORIGIN = 'https://celadon-belekoy-3846bb.netlify.app';

// 파일 앞부분(매직 바이트)으로 실제 형식 확인 — 확장자/브라우저 정보만 믿지 않음
function sniff(bytes) {
  const b = new Uint8Array(bytes.slice(0, 12));
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  const ascii = (s, e) => String.fromCharCode(...b.slice(s, e));
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  if (ascii(4, 8) === 'ftyp') return 'video/mp4';
  return '';
}

const localURL = (id) => `/.netlify/functions/media?id=${id}`;

async function saveMedia(media, id, bytes, name) {
  if (!bytes.byteLength) throw new Error('빈 파일입니다.');
  if (bytes.byteLength > MAX_BYTES) throw new Error('파일당 3.5MB 이하만 업로드 가능합니다.');
  const type = sniff(bytes);
  if (!type) throw new Error('JPG, PNG, WEBP 사진 또는 MP4 영상만 업로드할 수 있습니다.');
  await media.set(id, bytes, { metadata: { contentType: type, name: String(name || '').slice(0, 120), uploadedAt: new Date().toISOString() } });
}

// GET    ?id=UUID                   → 공개 미디어 파일
// POST   multipart(file)            → (관리자) 업로드, { url } 반환
// POST   JSON {action:'import',url} → (관리자) 기존 사이트 사진을 같은 ID로 이 사이트 저장소에 복사
// DELETE ?id=UUID                   → (관리자) 휴지통 저장소에 백업한 뒤 삭제
export default async (req, context) => {
  const media = store(context, 'media');
  const id = new URL(req.url).searchParams.get('id') || '';

  if (req.method === 'GET') {
    if (!UUID.test(id)) return fail('잘못된 요청입니다.', 400);
    const found = await media.getWithMetadata(id.toLowerCase(), { type: 'stream' });
    if (!found) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
    return new Response(found.data, {
      headers: {
        'Content-Type': found.metadata?.contentType || 'application/octet-stream',
        // 같은 ID의 파일은 절대 바뀌지 않으므로 오래 캐시해도 안전합니다.
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  }

  if (!['POST', 'DELETE'].includes(req.method)) return fail('지원하지 않는 요청입니다.', 405);
  if (!sameOriginRequest(req)) return fail('허용되지 않은 요청입니다.', 403);
  if (!isAdmin(req)) return fail('관리자 로그인이 필요합니다. 다시 로그인해 주세요.', 401);

  if (req.method === 'DELETE') {
    if (!UUID.test(id)) return fail('잘못된 요청입니다.');
    const key = id.toLowerCase();
    const content = await store(context, 'content').get(CONTENT_KEY, { type: 'json' });
    if (referencedMediaIds(content).has(key)) return fail('홈페이지에서 아직 사용 중인 파일이라 삭제하지 않았습니다.', 409);
    const found = await media.getWithMetadata(key, { type: 'arrayBuffer' });
    if (!found) return json({ ok: true, missing: true });
    await store(context, 'media-trash').set(key, found.data, { metadata: { ...found.metadata, deletedAt: new Date().toISOString() } });
    await media.delete(key);
    return json({ ok: true, trashed: true });
  }

  try {
    if ((req.headers.get('content-type') || '').includes('application/json')) {
      const body = await req.json();
      if (body?.action !== 'import') return fail('알 수 없는 요청입니다.');
      let source;
      try { source = new URL(body.url, LEGACY_ORIGIN); } catch { return fail('주소가 올바르지 않습니다.'); }
      const legacyId = source.searchParams.get('id') || '';
      if (source.origin !== LEGACY_ORIGIN || source.pathname !== '/.netlify/functions/media' || !UUID.test(legacyId))
        return fail('기존 홈페이지의 사진 주소만 복사할 수 있습니다.');
      const key = legacyId.toLowerCase();
      if (await media.getMetadata(key)) return json({ url: localURL(key), already: true });
      const res = await fetch(source.href, { redirect: 'error' });
      if (!res.ok) return fail(`기존 사이트에서 사진을 가져오지 못했습니다. (HTTP ${res.status})`, 502);
      await saveMedia(media, key, await res.arrayBuffer(), 'legacy-import');
      return json({ url: localURL(key), imported: true });
    }

    const form = await req.formData();
    const file = form.get('file');
    if (!file || typeof file === 'string') return fail('파일을 선택해 주세요.');
    const newId = randomUUID();
    await saveMedia(media, newId, await file.arrayBuffer(), file.name);
    return json({ url: localURL(newId) });
  } catch (err) {
    return fail(err.message || '업로드에 실패했습니다.');
  }
};
