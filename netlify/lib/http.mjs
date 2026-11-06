export function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
}

export const fail = (message, status = 400) => json({ error: message }, status);

// 관리자 화면(admin.js)은 모든 요청에 X-Admin-Request: 1 헤더를 붙입니다.
// 다른 사이트에서 위조한 요청(CSRF)은 이 헤더를 붙일 수 없으므로 변경 요청에서 반드시 확인합니다.
export function sameOriginRequest(req) {
  if (req.headers.get('x-admin-request') !== '1') return false;
  const origin = req.headers.get('origin');
  if (!origin) return true;
  try { return new URL(origin).host === new URL(req.url).host; } catch { return false; }
}
