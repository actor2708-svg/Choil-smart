/* 비식별 브라우저별 하루 한 번 집계. 숫자는 서버 응답에서만 표시합니다. */
(()=>{
  const today=document.getElementById('visitor-today'), total=document.getElementById('visitor-total'), note=document.getElementById('visitor-note');
  if(!today||!total||!note)return;
  function id(){
    try{let v=localStorage.getItem('joil-anon-visitor-v1');if(v && /^[a-f0-9-]{36}$/i.test(v))return v;
      v=crypto.randomUUID();localStorage.setItem('joil-anon-visitor-v1',v);return v;
    }catch(e){return crypto.randomUUID ? crypto.randomUUID() : null;}
  }
  async function run(){
    try{
      const visitorId=id();
      const response=await fetch('/.netlify/functions/visitor-stats',{method:visitorId?'POST':'GET',headers:{'Content-Type':'application/json'},body:visitorId?JSON.stringify({visitorId}):undefined,cache:'no-store'});
      if(!response.ok)throw Error('status '+response.status);
      const stats=await response.json();
      if(!Number.isInteger(stats.today)||!Number.isInteger(stats.total))throw Error('invalid stats');
      today.textContent=stats.today.toLocaleString('ko-KR');total.textContent=stats.total.toLocaleString('ko-KR');
      note.textContent='하루 기준 브라우저별 1회 집계 · 대한민국 시간';
    }catch(e){today.textContent='—';total.textContent='—';note.textContent='방문자 집계 서버 연결 필요';}
  }
  run();
})();
