import { randomUUID, createHash } from 'node:crypto';
import { store } from '../lib/stores.mjs';
import { json, fail, sameOriginRequest } from '../lib/http.mjs';
import { isAdmin } from '../lib/session.mjs';

// 학과 Q&A (익명 질문 → 관리자 승인 후 공개, 관리자 답변)
// GET    /.netlify/functions/qna          → 공개된(승인된) 질문과 답변
// GET    /.netlify/functions/qna?admin=1  → (관리자) 대기 중 포함 전체 질문
// POST   /.netlify/functions/qna          → 방문자 질문 등록 (승인 대기 상태로 저장)
// PATCH  /.netlify/functions/qna          → (관리자) { id, approved, answer } 승인·답변 저장
// DELETE /.netlify/functions/qna?id=KEY   → (관리자) 질문 삭제

const KEY = /^q\/\d{13}-[0-9a-f-]{36}$/;
const LIMITS = { title: [2, 80], body: [5, 2000], answer: [0, 3000] };
const RATE_WINDOW = 10 * 60 * 1000; // 10분
const RATE_MAX = 3; // 10분에 최대 3개
const MIN_FILL_MS = 3000; // 폼을 연 지 3초 이내 제출은 자동 등록으로 간주

class InputError extends Error {}

function text(value, [min, max], label) {
  if (typeof value !== 'string') throw new InputError(`${label}을(를) 입력해 주세요.`);
  // 제어 문자 제거 (줄바꿈·탭은 유지)
  const v = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/\r\n?/g, '\n').trim();
  if (v.length < min) throw new InputError(`${label}을(를) ${min}자 이상 입력해 주세요.`);
  if (v.length > max) throw new InputError(`${label}은(는) ${max}자 이내로 입력해 주세요.`);
  return v;
}

const publicView = (q) => ({
  id: q.id, title: q.title, body: q.body, createdAt: q.createdAt,
  answer: q.answer || '', answeredAt: q.answeredAt || null,
});

async function loadAll(qna) {
  const { blobs } = await qna.list({ prefix: 'q/' });
  const items = await Promise.all(blobs.map((b) => qna.get(b.key, { type: 'json' })));
  return items.filter(Boolean).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

function clientHash(req, context) {
  const ip = context?.ip || req.headers.get('x-nf-client-connection-ip') || 'unknown';
  return createHash('sha256').update(`joil-qna-v1:${ip}`).digest('hex').slice(0, 32);
}

export default async (req, context) => {
  const qna = store(context, 'qna');
  const url = new URL(req.url);

  try {
    if (req.method === 'GET') {
      if (url.searchParams.has('admin')) {
        if (!isAdmin(req)) return fail('관리자 로그인이 필요합니다.', 401);
        return json({ questions: await loadAll(qna) });
      }
      const all = await loadAll(qna);
      return json({ questions: all.filter((q) => q.approved).map(publicView) });
    }

    if (req.method === 'POST') {
      const origin = req.headers.get('origin');
      if (origin && origin !== url.origin) return fail('허용되지 않은 요청입니다.', 403);
      if (!(req.headers.get('content-type') || '').includes('application/json')) return fail('요청 형식이 올바르지 않습니다.', 415);
      const raw = await req.text();
      if (raw.length > 20000) return fail('내용이 너무 깁니다.', 413);
      let body;
      try { body = JSON.parse(raw); } catch { return fail('요청 형식이 올바르지 않습니다.'); }
      if (!body || typeof body !== 'object') return fail('요청 형식이 올바르지 않습니다.');

      // 스팸 방지 1: 사람에게 보이지 않는 입력칸(허니팟)이 채워졌으면 저장하지 않고 성공처럼 응답
      if (body.website) return json({ ok: true, pending: true });
      // 스팸 방지 2: 폼을 연 직후 바로 제출된 요청 차단
      const elapsed = Date.now() - Number(body.startedAt);
      if (!(elapsed >= MIN_FILL_MS && elapsed < 24 * 60 * 60 * 1000)) return fail('잠시 후 다시 등록해 주세요.', 429);

      const title = text(body.title, LIMITS.title, '제목');
      const content = text(body.body, LIMITS.body, '질문 내용');
      // 스팸 방지 3: 링크가 많은 글 차단
      if (((title + ' ' + content).match(/https?:\/\/|www\./gi) || []).length > 2) return fail('링크는 2개까지만 포함할 수 있습니다.');

      // 스팸 방지 4: 같은 접속 위치에서 10분에 3개까지 (IP는 해시로만 기록)
      const rateKey = `rate/${clientHash(req, context)}`;
      const now = Date.now();
      const recent = ((await qna.get(rateKey, { type: 'json' })) || []).filter((t) => now - t < RATE_WINDOW);
      if (recent.length >= RATE_MAX) return fail('짧은 시간에 너무 많은 질문이 등록되었습니다. 잠시 후 다시 시도해 주세요.', 429);
      await qna.setJSON(rateKey, [...recent, now]);

      const id = `q/${now}-${randomUUID()}`;
      const record = { id, title, body: content, createdAt: new Date(now).toISOString(), approved: false, answer: '', answeredAt: null };
      await qna.setJSON(id, record, { onlyIfNew: true });
      return json({ ok: true, pending: true }, 201);
    }

    if (req.method === 'PATCH' || req.method === 'DELETE') {
      if (!sameOriginRequest(req)) return fail('허용되지 않은 요청입니다.', 403);
      if (!isAdmin(req)) return fail('관리자 로그인이 필요합니다. 다시 로그인해 주세요.', 401);

      if (req.method === 'DELETE') {
        const id = url.searchParams.get('id') || '';
        if (!KEY.test(id)) return fail('질문을 찾을 수 없습니다.', 404);
        await qna.delete(id);
        return json({ ok: true });
      }

      let body;
      try { body = await req.json(); } catch { return fail('요청 형식이 올바르지 않습니다.'); }
      const id = typeof body?.id === 'string' ? body.id : '';
      if (!KEY.test(id)) return fail('질문을 찾을 수 없습니다.', 404);
      const existing = await qna.getWithMetadata(id, { type: 'json' });
      if (!existing?.data) return fail('질문을 찾을 수 없습니다.', 404);
      const answer = body.answer === undefined ? existing.data.answer : text(body.answer, LIMITS.answer, '답변');
      const next = {
        ...existing.data,
        approved: typeof body.approved === 'boolean' ? body.approved : existing.data.approved,
        answer,
        answeredAt: answer ? (answer === existing.data.answer ? existing.data.answeredAt : new Date().toISOString()) : null,
      };
      const result = await qna.setJSON(id, next, { onlyIfMatch: existing.etag });
      if (result && result.modified === false) return fail('다른 곳에서 먼저 수정되었습니다. 새로고침 후 다시 시도해 주세요.', 409);
      return json({ ok: true, question: next });
    }

    return fail('지원하지 않는 요청입니다.', 405);
  } catch (err) {
    if (err instanceof InputError) return fail(err.message);
    console.error('qna failed:', err?.message || err);
    return fail('Q&A 서버 처리 중 오류가 발생했습니다.', 500);
  }
};
