// 홈페이지 콘텐츠 JSON 검증. 형식이 잘못된 데이터가 저장되어 홈페이지가 깨지는 것을 막습니다.
// 알 수 없는 문자열 필드도 그대로 보존하여 기존 데이터가 사라지지 않게 합니다.

export const CONTENT_KEY = 'content';
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
export const MEDIA_PATH = new RegExp(`^/\\.netlify/functions/media\\?id=(${UUID})$`, 'i');

export function safeURL(v) {
  if (v === '' || v === undefined || v === null) return true;
  if (typeof v !== 'string') return false;
  if (/^(\.\/)?assets\//.test(v) && !v.includes('..')) return true;
  if (MEDIA_PATH.test(v)) return true;
  try { return new URL(v).protocol === 'https:'; } catch { return false; }
}

class ContentError extends Error {}
export { ContentError };

function str(v, max, label) {
  if (v === undefined || v === null) return '';
  if (typeof v !== 'string') throw new ContentError(`${label} 값이 올바르지 않습니다.`);
  if (v.length > max) throw new ContentError(`${label}은(는) ${max}자 이하로 입력해 주세요.`);
  return v;
}

function base(item) {
  const out = {};
  for (const [k, v] of Object.entries(item || {})) {
    if (k.startsWith('_')) continue;
    if (['string', 'number', 'boolean'].includes(typeof v) && String(v).length <= 4000) out[k] = v;
  }
  return out;
}

function uniqueIds(list, label) {
  const seen = new Set();
  for (const x of list) {
    if (typeof x.id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(x.id)) throw new ContentError(`${label} ID가 올바르지 않습니다.`);
    if (seen.has(x.id)) throw new ContentError(`${label} ID가 중복되었습니다: ${x.id}`);
    seen.add(x.id);
  }
  return seen;
}

export function validateContent(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ContentError('콘텐츠 형식이 올바르지 않습니다.');
  const { site, videos, albums, photos } = input;
  if (!site || typeof site !== 'object' || !Array.isArray(videos) || !Array.isArray(albums) || !Array.isArray(photos))
    throw new ContentError('site, videos, albums, photos 항목이 필요합니다.');
  if (videos.length > 300 || albums.length > 500 || photos.length > 10000) throw new ContentError('항목 수가 너무 많습니다.');

  const outSite = base(site);
  for (const [k, max] of Object.entries({ heroDescription: 450, admissionTitle: 80, admissionBody: 2000, phone: 35, admissionLink: 500, admissionLinkText: 60 }))
    outSite[k] = str(site[k], max, '학과·입학안내');
  if (outSite.admissionLink && !safeURL(outSite.admissionLink)) throw new ContentError('입학 공지 링크는 https 주소여야 합니다.');

  const outVideos = videos.map((v) => {
    const o = { ...base(v), id: v?.id, title: str(v?.title, 90, '영상 제목'), description: str(v?.description, 450, '영상 소개'),
      kind: v?.kind === 'youtube' ? 'youtube' : 'file', src: str(v?.src, 600, '영상 주소'), poster: str(v?.poster, 600, '썸네일 주소'),
      duration: str(v?.duration, 12, '재생시간'), category: str(v?.category, 35, '분류') };
    if (!o.src || !safeURL(o.src) || !safeURL(o.poster)) throw new ContentError(`영상 '${o.title}'의 주소가 올바르지 않습니다.`);
    return o;
  });
  uniqueIds(outVideos, '영상');

  const outAlbums = albums.map((a) => ({ ...base(a), id: a?.id, title: str(a?.title, 70, '앨범 이름'), description: str(a?.description, 350, '앨범 설명'),
    date: str(a?.date, 20, '앨범 날짜'), coverPhotoId: str(a?.coverPhotoId, 80, '대표사진') }));
  const albumIds = uniqueIds(outAlbums, '앨범');
  for (const a of outAlbums) if (!a.title.trim()) throw new ContentError('앨범 이름을 입력하세요.');

  const outPhotos = photos.map((p) => {
    const o = { ...base(p), id: p?.id, albumId: str(p?.albumId, 80, '앨범'), src: str(p?.src, 600, '사진 주소'),
      caption: str(p?.caption, 300, '사진 설명'), date: str(p?.date, 20, '사진 날짜') };
    if (!o.src || !safeURL(o.src)) throw new ContentError('사진 주소가 올바르지 않습니다.');
    if (!albumIds.has(o.albumId)) throw new ContentError('존재하지 않는 앨범에 연결된 사진이 있습니다.');
    return o;
  });
  uniqueIds(outPhotos, '사진');

  return { site: outSite, videos: outVideos, albums: outAlbums, photos: outPhotos };
}

// 콘텐츠에서 참조 중인 미디어 UUID 목록
export function referencedMediaIds(content) {
  const ids = new Set();
  const add = (u) => { const m = typeof u === 'string' && u.match(MEDIA_PATH); if (m) ids.add(m[1].toLowerCase()); };
  for (const v of content?.videos || []) { add(v.src); add(v.poster); }
  for (const p of content?.photos || []) add(p.src);
  return ids;
}
