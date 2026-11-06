(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const el=(tag,className,text)=>{const n=document.createElement(tag);if(className)n.className=className;if(text!==undefined)n.textContent=String(text);return n;};
  let data=(typeof structuredClone==='function'?structuredClone:(o)=>JSON.parse(JSON.stringify(o)))(window.JOIL_DEFAULT_CONTENT||{site:{},videos:[],albums:[],photos:[]});
  let editVideoID=null, selectedAlbumID=null, busy=false;
  const mediaURL=(s)=>typeof s==='string'&&/^\/\.netlify\/functions\/media\?id=[0-9a-f-]{36}$/i.test(s);
  const message=(s,error=false)=>{
    const n=$('admin-notice');n.textContent=s;n.classList.remove('hidden');n.classList.toggle('error',error);
    n.scrollIntoView({block:'nearest',behavior:'smooth'});
  };
  const setBusy=(yes)=>{busy=yes;for(const b of document.querySelectorAll('button[type=submit],#photo-files,#restore-file,#legacy-import,#server-backup-restore'))b.disabled=yes;};
  const fn='/\.netlify/functions/';
  async function api(name,options={}){
    const headers={'X-Admin-Request':'1',...(options.headers||{})};
    const res=await fetch('/.netlify/functions/'+name,{...options,headers,credentials:'same-origin',cache:'no-store'});
    let obj;try{obj=await res.json();}catch{obj={error:'서버 응답을 확인할 수 없습니다. Netlify Functions 배포 여부를 확인하세요.'};}
    if(!res.ok)throw new Error(obj?.error||`HTTP ${res.status}`);
    return obj;
  }
  const cloneObj=(o)=>(typeof structuredClone==='function'?structuredClone(o):JSON.parse(JSON.stringify(o)));
  let storeEmpty=false;
  // 서버 저장소의 최신 콘텐츠를 불러옴. 저장소가 비어 있으면 홈페이지에 내장된 기존 스냅샷을 사용(서버에는 아무것도 쓰지 않음)
  async function reload(){
    const r=await api('content');
    storeEmpty=!!r.empty;
    data=storeEmpty?cloneObj(window.JOIL_DEFAULT_CONTENT||{site:{},videos:[],albums:[],photos:[]}):r;
  }
  async function save(note='저장되었습니다.'){
    try{
      const response=await api('content',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
      data=response.content;storeEmpty=false;
    }catch(err){
      // 저장 실패 시 화면을 서버의 실제 상태로 되돌려, 저장되지 않은 내용이 저장된 것처럼 보이지 않게 함
      try{await reload();}catch{}
      renderAll();throw err;
    }
    renderAll();updateConnection();message(note);
  }
  function updateConnection(){
    $('admin-connection').textContent=storeEmpty?'● 저장소 연결됨 · 아직 저장 전 (기존 스냅샷 표시 중)':'● 저장소 연결됨 · 버전 '+(data._rev||0);
  }
  function updateStats(){
    $('stats-videos').textContent=data.videos.length;
    $('stats-albums').textContent=data.albums.length;
    $('stats-photos').textContent=data.photos.length;
  }
  function openSection(section){
    document.querySelectorAll('.admin-tab').forEach(b=>{
      const on=b.dataset.section===section;b.classList.toggle('active',on);b.setAttribute('aria-selected',String(on));
    });
    document.querySelectorAll('.admin-section').forEach(s=>s.classList.toggle('hidden',s.id!=='section-'+section));
    $('admin-notice').classList.add('hidden');
  }
  document.querySelectorAll('.admin-tab').forEach(b=>b.addEventListener('click',()=>openSection(b.dataset.section)));
  async function showManager(){
    await reload();
    $('login-panel').classList.add('hidden');$('manager-panel').classList.remove('hidden');$('logout-button').classList.remove('hidden');
    updateConnection();renderAll();
    if(storeEmpty)message(`이 사이트의 저장소는 아직 비어 있어, 홈페이지에 내장된 기존 자료(영상 ${data.videos.length}개 · 앨범 ${data.albums.length}개 · 사진 ${data.photos.length}장)를 불러왔습니다. 처음 저장할 때 이 자료가 그대로 저장소에 기록됩니다.`);
    loadServerBackups();
  }
  async function inspectLogin(){
    try{
      const r=await api('auth');
      if(r.loggedIn)await showManager();
      else if(!r.configured)$('login-message').textContent='서버 관리자 설정이 필요합니다. Netlify 환경 변수 2개를 설정해 주세요.';
    }catch{
      $('login-message').textContent='관리자 기능은 Netlify Functions로 배포해야 작동합니다. ZIP 안의 배포 안내를 확인하세요.';
    }
  }
  $('login-form').addEventListener('submit',async(e)=>{
    e.preventDefault();const pw=$('admin-password').value;
    const b=e.target.querySelector('button');b.disabled=true;$('login-message').textContent='로그인 확인 중...';
    try{await api('auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'login',password:pw})});
      $('admin-password').value='';await showManager();
    }catch(err){$('login-message').textContent=err.message;}finally{b.disabled=false;}
  });
  $('logout-button').addEventListener('click',async()=>{try{await api('auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'logout'})});}finally{location.reload();}});
  function renderAll(){updateStats();renderVideoList();renderAlbumList();renderPhotos();fillSite();renderLegacy();}
  // 유튜브 영상 ID(영문자·숫자·-·_ 11자) 추출: watch?v=, youtu.be/, embed/, shorts/, live/, ID 단독 입력 지원
  const youtubeID=(value)=>{
    if(typeof value!=='string')return '';
    let v=value.trim();
    if(/^[A-Za-z0-9_-]{11}$/.test(v))return v;
    if(!/^[a-z][a-z0-9+.-]*:\/\//i.test(v))v='https://'+v.replace(/^\/+/,'');
    try{
      const u=new URL(v);const host=u.hostname.toLowerCase();const parts=u.pathname.split('/').filter(Boolean);let id='';
      if(['youtu.be','www.youtu.be'].includes(host))id=parts[0]||'';
      else if(['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com','youtube-nocookie.com','www.youtube-nocookie.com'].includes(host)){
        if(parts[0]==='watch')id=u.searchParams.get('v')||'';
        else if(['embed','shorts','live','v','e'].includes(parts[0]))id=parts[1]||'';
      }
      id=decodeURIComponent(id).trim();
      return /^[A-Za-z0-9_-]{11}$/.test(id)?id:'';
    }catch{return '';}
  };
  const vForm=$('video-form');
  function clearVideoForm(){editVideoID=null;vForm.reset();vForm.elements.kind.value='youtube';$('video-form-heading').textContent='새 홍보영상 등록';$('video-save').textContent='영상 추가';$('video-src').placeholder='https://www.youtube.com/watch?v=...';}
  $('video-reset').addEventListener('click',clearVideoForm);
  $('video-kind').addEventListener('change',()=>{$('video-src').placeholder=vForm.elements.kind.value==='youtube'?'https://www.youtube.com/watch?v=...':'https://example.com/video.mp4';});
  function editVideo(id){
    const v=data.videos.find(v=>v.id===id);if(!v)return;
    editVideoID=id;
    for(const k of ['title','description','kind','src','duration','category'])vForm.elements[k].value=v[k]||'';
    $('video-form-heading').textContent='영상 수정';$('video-save').textContent='변경사항 저장';
    $('video-src').placeholder=v.kind==='youtube'?'https://www.youtube.com/watch?v=...':'https://example.com/video.mp4';
    vForm.scrollIntoView({behavior:'smooth',block:'start'});
  }
  async function uploadFile(file){
    if(!file)throw new Error('파일을 선택해 주세요.');
    if(file.size>3_500_000)throw new Error('파일당 3.5MB 이하만 업로드 가능합니다. 큰 영상은 유튜브 또는 MP4 링크로 등록하세요.');
    const form=new FormData();form.append('file',file,file.name);
    const result=await api('media',{method:'POST',body:form});return result.url;
  }
  function makeMini(label,fn,danger=false){const b=el('button','mini-button'+(danger?' danger':''),label);b.type='button';b.addEventListener('click',fn);return b;}
  function renderVideoList(){
    const list=$('admin-video-list');list.replaceChildren();$('video-list-count').textContent='('+data.videos.length+'개)';
    data.videos.forEach((v,i)=>{
      const wrap=el('div','manage-item');const img=el('img');img.src=v.poster||'assets/poster3.jpg';img.alt='';img.onerror=()=>{img.onerror=null;img.src='assets/poster3.jpg';};
      const info=el('div','manage-info');info.append(el('b','',v.title),el('small','',v.kind==='youtube'?'유튜브 영상':'MP4 영상'));
      const tools=el('div','manage-actions');
      tools.append(makeMini('수정',()=>{openSection('videos');editVideo(v.id);}));
      if(i>0)tools.append(makeMini('↑',async()=>{[data.videos[i-1],data.videos[i]]=[data.videos[i],data.videos[i-1]];try{await save('영상 순서가 바뀌었습니다.');}catch(err){message(err.message,true);}}));
      if(i<data.videos.length-1)tools.append(makeMini('↓',async()=>{[data.videos[i+1],data.videos[i]]=[data.videos[i],data.videos[i+1]];try{await save('영상 순서가 바뀌었습니다.');}catch(err){message(err.message,true);}}));
      tools.append(makeMini('삭제',async()=>{
        if(!confirm('이 영상을 목록에서 삭제할까요? 원본 영상이 포함된 ZIP 파일은 변경되지 않습니다.'))return;
        data.videos=data.videos.filter(item=>item.id!==v.id);if(editVideoID===v.id)clearVideoForm();
        try{await save('영상이 목록에서 삭제되었습니다.');if(mediaURL(v.src))await deleteMedia(v.src);if(mediaURL(v.poster))await deleteMedia(v.poster);}catch(err){message(err.message,true);}
      },true));
      wrap.append(img,info,tools);list.append(wrap);
    });
    if(!data.videos.length)list.append(el('p','help-note','등록된 영상이 없습니다.'));
  }
  vForm.addEventListener('submit',async(e)=>{
    e.preventDefault();if(busy)return;setBusy(true);
    try{
      const f=vForm.elements;
      let existing=editVideoID?data.videos.find(v=>v.id===editVideoID):null;
      let src=f.src.value.trim()||existing?.src||'',kind=f.kind.value;
      const videoFile=f.videoFile.files[0];
      if(videoFile){if(videoFile.type!=='video/mp4')throw new Error('MP4 영상만 업로드할 수 있습니다.');src=await uploadFile(videoFile);kind='file';}
      if(!src)throw new Error('영상 주소 또는 파일을 입력해 주세요.');
      if(kind==='youtube'){const yid=youtubeID(src);if(!yid)throw new Error('유튜브 영상 주소를 확인해 주세요. (예: https://www.youtube.com/watch?v=영상ID, https://youtu.be/영상ID, https://www.youtube.com/embed/영상ID)');src='https://www.youtube.com/watch?v='+yid;}
      let poster=existing?.poster||'assets/poster3.jpg';
      const posterFile=f.posterFile.files[0];if(posterFile){const processed=await shrinkImage(posterFile);poster=await uploadFile(processed);}
      const item={id:existing?.id||'video-'+crypto.randomUUID(),title:f.title.value.trim(),description:f.description.value.trim(),category:f.category.value.trim(),duration:f.duration.value.trim(),kind,src,poster};
      if(existing){data.videos=data.videos.map(v=>v.id===existing.id?item:v);}else data.videos.push(item);
      await save(existing?'영상 내용이 수정되었습니다.':'새 영상이 등록되었습니다.');
      clearVideoForm();
    }catch(err){message(err.message,true);}finally{setBusy(false);}
  });
  async function shrinkImage(file){
    if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('JPG, PNG, WEBP 사진만 업로드할 수 있습니다.');
    const bitmap=await createImageBitmap(file);
    const MAX=1700;const scale=Math.min(1,MAX/Math.max(bitmap.width,bitmap.height));
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
    const ctx=canvas.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
    let blob;
    for(const quality of [.84,.72,.60,.48]){blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));if(blob&&blob.size<=3_500_000)break;}
    if(!blob||blob.size>3_500_000)throw new Error('사진 크기가 너무 큽니다. 사진을 줄인 뒤 다시 올려주세요.');
    return new File([blob],(file.name.replace(/\.[^.]+$/,'')||'photo')+'.jpg',{type:'image/jpeg'});
  }
  const albumForm=$('album-form');
  function clearAlbum(){selectedAlbumID=null;albumForm.reset();$('album-form-heading').textContent='새 앨범 만들기';$('album-delete').classList.add('hidden');renderAlbumList();renderPhotos();}
  $('album-reset').addEventListener('click',clearAlbum);
  function selectAlbum(id){
    selectedAlbumID=id;
    const a=data.albums.find(a=>a.id===id);if(!a)return;
    for(const k of ['title','description','date'])albumForm.elements[k].value=a[k]||'';
    $('album-form-heading').textContent='앨범 정보 수정';$('album-delete').classList.remove('hidden');
    renderAlbumList();renderPhotos();
  }
  function renderAlbumList(){
    const list=$('admin-album-list');list.replaceChildren();
    data.albums.forEach(a=>{
      const count=data.photos.filter(p=>p.albumId===a.id).length;
      const b=el('button','album-option'+(selectedAlbumID===a.id?' selected':''));b.type='button';b.append(el('span','',a.title),el('small','',count+'장'));
      b.addEventListener('click',()=>selectAlbum(a.id));list.append(b);
    });
    if(!data.albums.length)list.append(el('p','help-note','아직 앨범이 없습니다. 새 앨범을 만들어 보세요.'));
  }
  albumForm.addEventListener('submit',async(e)=>{
    e.preventDefault();if(busy)return;setBusy(true);
    try{
      const f=albumForm.elements;
      if(!f.title.value.trim())throw new Error('앨범 이름을 입력하세요.');
      const old=data.albums.find(a=>a.id===selectedAlbumID);
      const a={id:old?.id||'album-'+crypto.randomUUID(),title:f.title.value.trim(),description:f.description.value.trim(),date:f.date.value,coverPhotoId:old?.coverPhotoId||''};
      if(old)data.albums=data.albums.map(x=>x.id===old.id?a:x);else data.albums.unshift(a);
      await save(old?'앨범 정보가 수정되었습니다.':'새 앨범이 만들어졌습니다.');selectAlbum(a.id);
    }catch(err){message(err.message,true);}finally{setBusy(false);}
  });
  $('album-delete').addEventListener('click',async()=>{
    const a=data.albums.find(a=>a.id===selectedAlbumID);if(!a)return;
    const photos=data.photos.filter(p=>p.albumId===a.id);
    if(!confirm(`'${a.title}' 앨범과 사진 ${photos.length}장을 삭제할까요? 이 작업은 되돌릴 수 없습니다.`))return;
    data.albums=data.albums.filter(x=>x.id!==a.id);data.photos=data.photos.filter(x=>x.albumId!==a.id);
    try{await save('앨범과 연결된 사진이 삭제되었습니다.');for(const p of photos)if(mediaURL(p.src))await deleteMedia(p.src);clearAlbum();}catch(err){message(err.message,true);}
  });
  async function deleteMedia(url){
    const id=new URL(url,location.origin).searchParams.get('id');
    try{await api('media?id='+encodeURIComponent(id),{method:'DELETE'});}catch{ /* 홈페이지 콘텐츠 삭제는 완료, 파일 정리 실패 시 보존 */ }
  }
  function renderPhotos(){
    const a=data.albums.find(a=>a.id===selectedAlbumID);const list=$('admin-photo-list');list.replaceChildren();
    $('photo-tools').classList.toggle('hidden',!a);
    $('photo-upload-info').textContent=a?`현재 선택한 앨범: ${a.title} · ${data.photos.filter(p=>p.albumId===a.id).length}장`:'먼저 왼쪽에서 앨범을 만들거나 선택하세요.';
    if(!a)return;
    const photos=data.photos.filter(p=>p.albumId===a.id);
    if(!photos.length){list.append(el('p','help-note','사진이 없습니다. 여러 장을 선택해 업로드해 보세요.'));return;}
    photos.forEach((p,idx)=>{
      const card=el('div','admin-photo-card');const img=el('img');img.src=p.src;img.alt=p.caption||a.title;img.loading='lazy';
      const controls=el('div','photo-controls');
      const order=el('small','photo-order',`${idx+1}번째${a.coverPhotoId===p.id?' · 대표사진':''}`);
      const caption=el('input');caption.type='text';caption.maxLength=300;caption.value=p.caption||'';caption.placeholder='사진 설명 입력';caption.setAttribute('aria-label','사진 설명');
      const date=el('input');date.type='date';date.value=/^\d{4}-\d{2}-\d{2}$/.test(p.date||'')?p.date:'';date.setAttribute('aria-label','사진 날짜');
      const actions=el('div','inline-actions');actions.append(makeMini('설명·날짜 저장',async()=>{if(busy)return;p.caption=caption.value.trim();p.date=date.value;try{await save('사진 설명과 날짜를 저장했습니다.');}catch(err){message(err.message,true);}}));
      actions.append(makeMini(a.coverPhotoId===p.id?'대표사진 ✓':'대표사진',async()=>{if(busy)return;a.coverPhotoId=p.id;try{await save('앨범 대표사진이 변경되었습니다.');}catch(err){message(err.message,true);}}));
      const order2=el('div','inline-actions');
      if(idx>0)order2.append(makeMini('◀ 앞으로',()=>movePhoto(p,-1)));
      if(idx<photos.length-1)order2.append(makeMini('뒤로 ▶',()=>movePhoto(p,1)));
      order2.append(makeMini('삭제',async()=>{
        if(busy||!confirm('이 사진을 삭제하시겠습니까? (삭제 전 상태는 서버 자동 백업에 보관됩니다.)'))return;
        data.photos=data.photos.filter(x=>x.id!==p.id);if(a.coverPhotoId===p.id)a.coverPhotoId='';
        try{await save('사진을 삭제했습니다.');if(mediaURL(p.src))await deleteMedia(p.src);}catch(err){message(err.message,true);}
      },true));controls.append(order,caption,date,actions,order2);card.append(img,controls);list.append(card);
    });
  }
  // 같은 앨범 안에서 사진 순서를 바꿈 (홈페이지 표시 순서와 동일)
  async function movePhoto(p,dir){
    if(busy)return;
    const same=data.photos.filter(x=>x.albumId===p.albumId);const other=same[same.indexOf(p)+dir];if(!other)return;
    const gi=data.photos.indexOf(p),go=data.photos.indexOf(other);[data.photos[gi],data.photos[go]]=[other,p];
    setBusy(true);try{await save('사진 순서가 바뀌었습니다.');}catch(err){message(err.message,true);}finally{setBusy(false);}
  }
  async function uploadPhotos(files){
    const a=data.albums.find(a=>a.id===selectedAlbumID);
    if(!a){message('먼저 앨범을 선택하세요.',true);return;}
    if(busy)return;
    const selected=Array.from(files).filter(Boolean).slice(0,30);
    if(!selected.length)return;
    if(!confirm(`'${a.title}' 앨범에 사진 ${selected.length}장을 등록할까요? 공개 홈페이지에 표시됩니다.`))return;
    setBusy(true);$('upload-progress').classList.remove('hidden');
    let completed=0,failed=[];
    for(const [i,file] of selected.entries()){
      $('upload-progress').textContent=`사진 업로드 중 ${i+1} / ${selected.length} · ${file.name}`;
      try{
        const compressed=await shrinkImage(file);const src=await uploadFile(compressed);
        const item={id:'photo-'+crypto.randomUUID(),albumId:a.id,src,caption:file.name.replace(/\.[^.]+$/,'').slice(0,100),date:a.date||''};
        data.photos.push(item);if(!a.coverPhotoId)a.coverPhotoId=item.id;
        await save('사진 등록 중: '+(i+1)+' / '+selected.length);
        completed++;
      }catch(err){failed.push(file.name+': '+err.message);}
    }
    $('upload-progress').classList.add('hidden');setBusy(false);renderAll();
    message(`사진 ${completed}장 등록 완료.${failed.length?' 실패 '+failed.length+'장: '+failed.slice(0,2).join('; '):''}`,failed.length>0);
    $('photo-files').value='';
  }
  $('photo-files').addEventListener('change',(e)=>uploadPhotos(e.target.files));
  const drop=$('photo-dropzone');
  for(const ev of ['dragenter','dragover'])drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.add('dragging');});
  for(const ev of ['dragleave','drop'])drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.remove('dragging');});
  drop.addEventListener('drop',e=>uploadPhotos(e.dataTransfer.files));
  function fillSite(){
    const f=$('site-form').elements;
    for(const key of ['heroDescription','admissionTitle','admissionBody','phone','admissionLink','admissionLinkText'])f[key].value=data.site?.[key]||'';
  }
  $('site-form').addEventListener('submit',async e=>{
    e.preventDefault();if(busy)return;setBusy(true);
    try{
      const f=e.target.elements;
      data.site=Object.fromEntries(['heroDescription','admissionTitle','admissionBody','phone','admissionLink','admissionLinkText'].map(k=>[k,f[k].value.trim()]));
      await save('학과소개와 입학안내 내용이 저장되었습니다.');
    }catch(err){message(err.message,true);}finally{setBusy(false);}
  });
  $('backup-button').addEventListener('click',()=>{
    const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const link=el('a');const url=URL.createObjectURL(blob);
    link.href=url;link.download='조일고_스마트기술과_콘텐츠백업_'+new Date().toISOString().slice(0,10)+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  $('restore-file').addEventListener('change',async e=>{
    const file=e.target.files[0];if(!file)return;
    if(!confirm('현재 홈페이지의 영상·앨범·소개 문구를 선택한 백업의 내용으로 교체할까요?'))return;
    try{const backup=JSON.parse(await file.text());if(!backup?.site||!Array.isArray(backup.videos)||!Array.isArray(backup.photos)||!Array.isArray(backup.albums))throw new Error('올바른 백업 파일이 아닙니다.');
      backup._rev=data._rev;data=backup;await save('콘텐츠 백업이 복원되었습니다.');clearVideoForm();clearAlbum();loadServerBackups();
    }catch(err){message('복원 실패: '+err.message,true);}finally{e.target.value='';}
  });
  // ── 서버 자동 백업: 콘텐츠를 저장할 때마다 서버가 저장 직전 상태를 보관 ──
  async function loadServerBackups(){
    const sel=$('server-backup-select');if(!sel)return;
    try{
      const r=await api('content?backups=1');sel.replaceChildren();
      if(!r.backups.length){const o=el('option','','아직 자동 백업이 없습니다');o.value='';sel.append(o);return;}
      for(const k of r.backups){const m=k.match(/^content-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-\d+Z-rev(\d+)$/);
        const o=el('option','',m?`${m[1]} ${m[2]}:${m[3]}:${m[4]} (UTC) · 버전 ${m[5]}`:k);o.value=k;sel.append(o);}
    }catch(err){sel.replaceChildren(el('option','','백업 목록을 불러오지 못했습니다'));}
  }
  $('server-backup-refresh')?.addEventListener('click',loadServerBackups);
  $('server-backup-restore')?.addEventListener('click',async()=>{
    const key=$('server-backup-select').value;if(!key||busy)return;
    if(!confirm('선택한 시점의 내용으로 홈페이지를 되돌릴까요? 현재 상태도 자동 백업된 뒤 복원됩니다.'))return;
    setBusy(true);
    try{const b=await api('content?backup='+encodeURIComponent(key));b._rev=data._rev;data=b;await save('서버 자동 백업으로 복원했습니다.');clearVideoForm();clearAlbum();loadServerBackups();}
    catch(err){message('복원 실패: '+err.message,true);}finally{setBusy(false);}
  });
  // ── 기존 홈페이지(celadon-belekoy-3846bb) 사진을 이 사이트 저장소로 복사 ──
  // 기존 사이트는 읽기만 하며, 같은 사진 ID를 유지해 복사합니다. 여러 번 실행해도 안전합니다.
  const LEGACY=/^https:\/\/celadon-belekoy-3846bb\.netlify\.app\/\.netlify\/functions\/media\?id=[0-9a-f-]{36}$/i;
  function legacyRefs(){
    const refs=[];
    for(const p of data.photos)if(LEGACY.test(p.src||''))refs.push([p,'src']);
    for(const v of data.videos){if(LEGACY.test(v.src||''))refs.push([v,'src']);if(LEGACY.test(v.poster||''))refs.push([v,'poster']);}
    return refs;
  }
  function renderLegacy(){
    const info=$('legacy-info');if(!info)return;const n=legacyRefs().length;
    info.textContent=n?`기존 홈페이지 서버에 연결된 사진·썸네일이 ${n}개 있습니다. 기존 서버가 종료되어도 사진이 유지되도록 이 사이트 저장소로 복사할 수 있습니다.`:'모든 사진이 이 사이트 저장소에 보관되어 있습니다.';
    $('legacy-import').classList.toggle('hidden',!n);
  }
  $('legacy-import')?.addEventListener('click',async()=>{
    if(busy)return;const refs=legacyRefs();if(!refs.length)return;
    const urls=[...new Set(refs.map(([o,k])=>o[k]))];
    if(!confirm(`기존 홈페이지의 사진 ${urls.length}개를 이 사이트 저장소로 복사할까요?\n기존 사이트의 사진은 변경·삭제되지 않습니다.`))return;
    setBusy(true);const box=$('legacy-progress');box.classList.remove('hidden');
    const map=new Map();const failed=[];
    for(const [i,url] of urls.entries()){
      box.textContent=`사진 복사 중 ${i+1} / ${urls.length}`;
      try{const r=await api('media',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'import',url})});map.set(url,r.url);}
      catch(err){failed.push(err.message);}
    }
    for(const [o,k] of refs)if(map.has(o[k]))o[k]=map.get(o[k]);
    box.classList.add('hidden');
    try{if(map.size)await save(`사진 ${map.size}개를 이 사이트 저장소로 복사했습니다.`+(failed.length?` 실패 ${failed.length}개(다시 실행하면 이어서 복사): ${failed[0]}`:''));else message('복사하지 못했습니다: '+(failed[0]||''),true);}
    catch(err){message(err.message,true);}finally{setBusy(false);renderLegacy();}
  });
  clearVideoForm();inspectLogin();
})();
