(() => {
  'use strict';
  // 학과 Q&A 관리 (기존 관리자 로그인 세션을 그대로 사용, 권한은 서버에서 검증)
  const $ = (id) => document.getElementById(id);
  const listBox = $('qna-admin-list'), statusLine = $('qna-admin-status'), filter = $('qna-filter');
  if (!listBox) return;
  const API = '/.netlify/functions/qna';
  let items = [];
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = String(text); return n; };
  const say = (s) => { statusLine.textContent = s; };
  const when = (iso) => { try { return new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }); } catch { return ''; } };

  async function call(query = '', options = {}) {
    const res = await fetch(API + query, { ...options, headers: { 'X-Admin-Request': '1', ...(options.headers || {}) }, credentials: 'same-origin', cache: 'no-store' });
    const data = await res.json().catch(() => ({ error: '서버 응답을 확인할 수 없습니다.' }));
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
    return data;
  }

  async function load() {
    say('불러오는 중…');
    try { items = (await call('?admin=1')).questions || []; say(''); render(); }
    catch (err) { say(err.message); }
  }

  function render() {
    const f = filter.value;
    const shown = items.filter((q) => f === 'all' || (f === 'approved' ? q.approved : !q.approved));
    $('qna-count').textContent = `대기 ${items.filter((q) => !q.approved).length}건 · 공개 ${items.filter((q) => q.approved).length}건`;
    if (!shown.length) { listBox.replaceChildren(el('p', 'help-note', '해당하는 질문이 없습니다.')); return; }
    listBox.replaceChildren(...shown.map((q) => {
      const card = el('div', 'manage-item');
      card.style.display = 'block';
      const head = el('div', 'manage-info');
      head.append(el('b', '', q.title), el('small', '', `${when(q.createdAt)} · ${q.approved ? '공개 중' : '승인 대기'}${q.answer ? ' · 답변 완료' : ''}`));
      const body = el('p', '', q.body); body.style.whiteSpace = 'pre-line'; body.style.overflowWrap = 'anywhere'; body.style.margin = '10px 0';
      const form = el('form', 'stack-form');
      const lab = el('label', '', '관리자 답변');
      const ta = el('textarea'); ta.rows = 4; ta.maxLength = 3000; ta.value = q.answer || ''; ta.placeholder = '답변 내용 (비워 두면 "답변 준비 중"으로 표시)';
      lab.append(ta);
      const chkLab = el('label'); chkLab.style.display = 'flex'; chkLab.style.alignItems = 'center';
      const chk = el('input'); chk.type = 'checkbox'; chk.checked = !!q.approved; chk.style.width = 'auto';
      chkLab.append(chk, document.createTextNode(' 홈페이지에 공개 (승인)'));
      const actions = el('div', 'inline-actions');
      const save = el('button', 'admin-primary', '저장'); save.type = 'submit';
      const del = el('button', 'danger-button', '삭제'); del.type = 'button';
      actions.append(save, del);
      form.append(lab, chkLab, actions);
      form.addEventListener('submit', async (e) => {
        e.preventDefault(); save.disabled = true;
        try {
          const r = await call('', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: q.id, answer: ta.value, approved: chk.checked }) });
          Object.assign(q, r.question); say('저장되었습니다.'); render();
        } catch (err) { say(err.message); } finally { save.disabled = false; }
      });
      del.addEventListener('click', async () => {
        if (!confirm(`"${q.title}" 질문을 삭제할까요? 삭제하면 되돌릴 수 없습니다.`)) return;
        try { await call('?id=' + encodeURIComponent(q.id), { method: 'DELETE' }); items = items.filter((x) => x !== q); say('삭제되었습니다.'); render(); }
        catch (err) { say(err.message); }
      });
      card.append(head, body, form);
      return card;
    }));
  }

  filter.addEventListener('change', render);
  $('qna-refresh').addEventListener('click', load);
  document.querySelector('.admin-tab[data-section="qna"]')?.addEventListener('click', load);
})();
