(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const form = $('qna-form'), list = $('qna-list'), status = $('qna-status');
  if (!form || !list) return;
  const API = '/.netlify/functions/qna';
  const startedAt = Date.now();
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = String(text); return n; };
  const day = (iso) => { try { return new Date(iso).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' }); } catch { return ''; } };
  const say = (msg, err = false) => { status.textContent = msg; status.classList.toggle('error', err); };

  async function load() {
    try {
      const res = await fetch(API, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error);
      render(data.questions || []);
    } catch {
      list.replaceChildren(el('p', 'qna-empty', '질문 목록을 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.'));
    }
  }

  function render(items) {
    if (!items.length) { list.replaceChildren(el('p', 'qna-empty', '아직 공개된 질문이 없습니다. 첫 질문을 남겨 주세요.')); return; }
    list.replaceChildren(...items.map((q) => {
      const d = el('details', 'qna-item');
      const s = el('summary');
      s.append(el('span', '', 'Q. ' + q.title), el('small', '', day(q.createdAt)));
      d.append(s, el('p', 'qna-q', q.body));
      const a = el('div', q.answer ? 'qna-a' : 'qna-a waiting');
      if (q.answer) { a.append(el('b', '', 'A. 스마트기술과 답변'), document.createTextNode(q.answer)); }
      else a.textContent = '답변을 준비 중입니다.';
      d.append(a);
      return d;
    }));
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = form.elements.title.value.trim(), body = form.elements.body.value.trim();
    if (title.length < 2) return say('제목을 2자 이상 입력해 주세요.', true);
    if (body.length < 5) return say('질문 내용을 5자 이상 입력해 주세요.', true);
    const btn = $('qna-submit'); btn.disabled = true; say('등록 중입니다…');
    try {
      const res = await fetch(API, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body, website: form.elements.website.value, startedAt }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || '등록하지 못했습니다.');
      form.reset();
      say('질문이 접수되었습니다. 관리자 확인 후 답변과 함께 공개됩니다.');
    } catch (err) {
      say(err.message || '등록하지 못했습니다. 잠시 후 다시 시도해 주세요.', true);
    } finally { btn.disabled = false; }
  });

  load();
})();
