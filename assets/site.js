(() => {
  'use strict';
  const defaults = window.JOIL_DEFAULT_CONTENT || {site:{}, videos:[], albums:[], photos:[]};
  // 구형 안드로이드 WebView(카카오톡 인앱 등)에서 지원하지 않는 최신 함수로 스크립트 전체가 멈추지 않도록 대체 처리
  const cloneData = (obj) => (typeof structuredClone === 'function' ? structuredClone(obj) : JSON.parse(JSON.stringify(obj)));
  const clearNode = (node) => { while (node.firstChild) node.removeChild(node.firstChild); };
  let content = cloneData(defaults);
  let currentAlbum = 'all';
  let visiblePhotos = [];
  let photoIndex = 0;
  let previousFocus = null;
  const $ = (id) => document.getElementById(id);
  const make = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = String(text);
    return node;
  };
  const safeURL = (value) => {
    if (typeof value !== 'string') return '';
    const v = value.trim();
    if (/^(assets\/|\.\/assets\/)/.test(v) && !v.includes('..')) return v;
    if (/^\/\.netlify\/functions\/media\?id=[0-9a-f-]{36}$/i.test(v)) return v;
    try {const u=new URL(v);if(u.protocol==='https:') return u.href;}catch(e){}
    return '';
  };
  // 유튜브 영상 ID: 영문자·숫자·하이픈(-)·밑줄(_) 11자
  // 지원 형식: youtube.com/watch?v=ID, youtu.be/ID, youtube.com/embed/ID, shorts/live, 영상 ID 단독
  const youtubeID = (value) => {
    if (typeof value !== 'string') return '';
    let v = value.trim();
    if (/^[A-Za-z0-9_-]{11}$/.test(v)) return v;
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(v)) v = 'https://' + v.replace(/^\/+/, '');
    try {
      const u = new URL(v);
      const host = u.hostname.toLowerCase();
      const parts = u.pathname.split('/').filter(Boolean);
      let id = '';
      if (['youtu.be','www.youtu.be'].includes(host)) id = parts[0] || '';
      else if (['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com','youtube-nocookie.com','www.youtube-nocookie.com'].includes(host)) {
        if (parts[0] === 'watch') id = u.searchParams.get('v') || '';
        else if (['embed','shorts','live','v','e'].includes(parts[0])) id = parts[1] || '';
      }
      id = decodeURIComponent(id).trim();
      return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : '';
    } catch (e) { return ''; }
  };
  // 영상 카드 클릭(사용자 동작) 직후 iframe을 만들므로 autoplay=1로 바로 재생 시도
  // enablejsapi·origin·widget_referrer: 안드로이드 WebView(카카오톡 등)에서 Referer가 빠질 때 생기는 오류 153 예방 및 오류 코드 수신용
  const youtubeEmbed = (value) => {
    const id = youtubeID(value);
    if (!id) return '';
    let url = 'https://www.youtube-nocookie.com/embed/' + id + '?rel=0&playsinline=1&autoplay=1&enablejsapi=1';
    if (/^https?:$/.test(location.protocol)) url += '&origin=' + encodeURIComponent(location.origin) + '&widget_referrer=' + encodeURIComponent(location.origin + location.pathname);
    return url;
  };
  const youtubeWatch = (value) => { const id = youtubeID(value); return id ? 'https://www.youtube.com/watch?v=' + id : ''; };
  const YT_ERRORS = {2:'영상 주소 정보가 올바르지 않습니다.',5:'이 브라우저에서 유튜브 플레이어를 실행할 수 없습니다.',100:'영상이 삭제되었거나 비공개 상태입니다.',101:'영상 소유자가 다른 사이트에서의 재생을 허용하지 않았습니다.',150:'영상 소유자가 다른 사이트에서의 재생을 허용하지 않았습니다.',153:'이 브라우저에서 유튜브 플레이어 설정 오류가 발생했습니다.'};
  let ytListenTimer = null;
  const isYouTubeOrigin = (origin) => /^https:\/\/(www\.)?youtube(-nocookie)?\.com$/.test(origin);
  // 재생 실패 시 원본 영상(유튜브 앱/사이트 또는 MP4 파일)으로 이동하는 버튼 표시
  function setFallback(url, label){
    const box=$('video-fallback');clearNode(box);
    if(!url){box.hidden=true;return;}
    const a=make('a','video-fallback-link',label+' ↗');a.href=url;a.target='_blank';a.rel='noopener noreferrer';
    box.append(a);box.hidden=false;
  }
  function showVideoError(message, url, label){
    const frame=$('video-frame');clearNode(frame);
    const panel=make('div','video-error');panel.setAttribute('role','alert');
    panel.append(make('strong','','영상을 재생할 수 없습니다'),make('p','',message));
    if(url){const a=make('a','video-fallback-link',label+' ↗');a.href=url;a.target='_blank';a.rel='noopener noreferrer';panel.append(a);}
    frame.append(panel);
  }
  window.addEventListener('message',(e)=>{
    if(!isYouTubeOrigin(e.origin))return;
    const iframe=$('video-frame').querySelector('iframe');
    if(!iframe||e.source!==iframe.contentWindow)return;
    let data=e.data;
    if(typeof data==='string'){try{data=JSON.parse(data);}catch(err){return;}}
    if(!data||typeof data!=='object')return;
    if(data.event==='onReady'||data.event==='initialDelivery'||data.event==='infoDelivery'){if(ytListenTimer){clearInterval(ytListenTimer);ytListenTimer=null;}}
    if(data.event==='onError'){
      const code=Number(data.info);
      const watch=iframe.getAttribute('data-watch')||'';
      showVideoError((YT_ERRORS[code]||'유튜브 영상을 불러오지 못했습니다.')+' (오류 코드 '+code+')',watch,'유튜브에서 보기');
    }
  });
  function toast(message){
    const old=document.querySelector('.toast'); if(old)old.remove();
    const n=make('div','toast',message);n.setAttribute('role','status');document.body.append(n);
    setTimeout(()=>n.remove(),4500);
  }
  function loadSite(){
    const s=content.site||{};
    // 새 홍보 방향: 이전 기본 문구만 최신 안내로 보여주며, 관리자가 직접 저장한 다른 문구는 변경하지 않는다.
    const legacyHero='군특성화와 스마트기술을 함께 준비하는 곳. 조일고등학교 스마트기술과의 이야기를 만나보세요.';
    const legacyAdmission='군특성화와 자동화 설비, 반도체·스마트기술 분야를 준비하는 스마트기술과입니다. 모집 일정과 자세한 전형은 학교 공지사항을 확인해 주세요.';
    const heroText=s.heroDescription||defaults.site.heroDescription;
    const admissionText=s.admissionBody||defaults.site.admissionBody;
    $('hero-description').textContent=heroText===legacyHero?defaults.site.heroDescription:heroText;
    $('admission-title').textContent=s.admissionTitle||defaults.site.admissionTitle;
    $('admission-body').textContent=admissionText===legacyAdmission?defaults.site.admissionBody:admissionText;
    const link=$('admission-link');const href=safeURL(s.admissionLink||'');
    if(href){link.href=href;link.textContent=(s.admissionLinkText||'입학 안내 자세히 보기')+' ↗';link.classList.remove('hidden');}
    else link.classList.add('hidden');
    const phone=s.phone||'053-235-9095';
    $('phone-link').textContent=phone;$('phone-link').href='tel:'+phone.replace(/\D/g,'');
    $('footer-phone').textContent='☎ '+phone;$('footer-phone').href='tel:'+phone.replace(/\D/g,'');
  }
  function drawVideos(){
    const grid=$('video-grid');clearNode(grid);
    const vids=content.videos||[];
    if(!vids.length){grid.append(make('p','sub','등록된 홍보영상이 없습니다.'));return;}
    vids.forEach((v,i)=>{
      const b=make('button','vcard');b.type='button';b.setAttribute('aria-label',v.title+' 영상 재생');
      const cover=make('div','poster');
      const imgURL=safeURL(v.poster);if(imgURL){const img=make('img');img.src=imgURL;img.alt=v.title+' 영상 대표 사진';img.loading=i===0?'eager':'lazy';cover.append(img);}
      cover.append(make('span','play','▶'));
      if(v.duration)cover.append(make('span','duration',v.duration));
      const info=make('div','cardbody');info.append(make('div','num','VIDEO '+String(i+1).padStart(2,'0')+' · '+(v.category||'SMART TECHNOLOGY')));
      info.append(make('h3','',v.title),make('p','',v.description||''));
      const watch=make('span','watch','영상 보기  ↗');info.append(watch);
      b.append(cover,info);b.addEventListener('click',()=>openVideo(v,b));grid.append(b);
    });
  }
  function openVideo(video, source){
    const frame=$('video-frame');clearNode(frame);
    const videoDialog=$('video-dialog');
    videoDialog.classList.remove('video-portrait');
    if(ytListenTimer){clearInterval(ytListenTimer);ytListenTimer=null;}
    let media=null;
    if(video.kind==='youtube'){
      const embed=youtubeEmbed(video.src);
      if(!embed){toast('유효한 유튜브 주소가 아닙니다.');return;}
      const watch=youtubeWatch(video.src);
      const iframe=make('iframe');iframe.src=embed;iframe.title=video.title;iframe.loading='eager';
      iframe.setAttribute('allow','autoplay; encrypted-media; picture-in-picture; fullscreen');
      iframe.setAttribute('allowfullscreen','');iframe.allowFullscreen=true;
      iframe.setAttribute('referrerpolicy','strict-origin-when-cross-origin');
      iframe.setAttribute('data-watch',watch);
      // IFrame API와 같은 방식으로 플레이어 이벤트(오류 101·150·153 등) 수신 요청
      iframe.addEventListener('load',()=>{
        let tries=0;
        const ping=()=>{tries++;if(tries>20||!iframe.contentWindow){clearInterval(ytListenTimer);ytListenTimer=null;return;}
          try{iframe.contentWindow.postMessage(JSON.stringify({event:'listening',id:'joil-yt',channel:'widget'}),'*');}catch(err){}};
        if(ytListenTimer)clearInterval(ytListenTimer);ytListenTimer=setInterval(ping,250);ping();
      });
      frame.append(iframe);
      setFallback(watch,'유튜브에서 보기');
    } else {
      const url=safeURL(video.src);
      if(!url){toast('재생 가능한 영상 주소가 없습니다.');return;}
      // 기본 1·2번 영상(9:16)은 재생 시작 전부터 세로형 화면을 사용한다.
      // 관리자가 영상을 교체해도 실제 파일의 메타데이터로 화면 비율을 자동 보정한다.
      if (/^(?:\.\/)?assets\/video[12]\.mp4(?:[?#].*)?$/.test(url)) videoDialog.classList.add('video-portrait');
      media=make('video');media.controls=true;media.playsInline=true;
      media.addEventListener('loadedmetadata',()=>{
        if(media.videoWidth>0 && media.videoHeight>0) videoDialog.classList.toggle('video-portrait',media.videoHeight>media.videoWidth);
      });
      media.setAttribute('playsinline','');media.setAttribute('webkit-playsinline','');media.preload='metadata';
      const poster=safeURL(video.poster);if(poster)media.poster=poster;
      const srcEl=make('source');srcEl.src=url;srcEl.type='video/mp4';
      // 디코딩·네트워크 오류 시 원본 파일로 이동할 수 있게 안내
      const onFail=()=>{if(media.parentNode===frame)showVideoError('이 기기에서 영상을 불러오지 못했습니다. 원본 영상을 열어 재생해 주세요.',url,'원본 영상 열기');};
      srcEl.addEventListener('error',onFail);media.addEventListener('error',onFail);
      media.append(srcEl);frame.append(media);
      setFallback(url,'원본 영상 열기');
    }
    $('video-dialog-title').textContent=video.title;
    openDialog('video-dialog',source);
    // 팝업을 화면에 표시한 뒤, 같은 클릭(사용자 동작) 안에서 재생 시작
    if(media){try{const playing=media.play();if(playing&&typeof playing.catch==='function')playing.catch(()=>{});}catch(err){}}
  }
  function allAlbumPhotos(albumId){return (content.photos||[]).filter(p=>albumId==='all'||p.albumId===albumId);}
  function drawGallery(){
    const filter=$('album-filter');clearNode(filter);
    const albums=content.albums||[];
    if(currentAlbum!=='all'&&!albums.some(a=>a.id===currentAlbum))currentAlbum='all';
    const button=(name,id)=>{const b=make('button',currentAlbum===id?'selected':'',name);b.type='button';b.setAttribute('aria-pressed',String(currentAlbum===id));b.addEventListener('click',()=>{currentAlbum=id;drawGallery();});return b;};
    filter.append(button('전체 앨범','all'));
    albums.forEach(a=>filter.append(button(a.title,a.id)));
    const target=$('gallery-content');clearNode(target);
    const count=allAlbumPhotos('all').length;
    $('gallery-count').textContent=count?`사진 ${count}장 · 앨범 ${albums.length}개`:'앨범 준비 중';
    if(!albums.length){
      const empty=make('div','gallery-empty');empty.append(make('span','empty-icon','▧'),make('h3','','활동사진을 준비하고 있습니다.'),make('p','','군특성화 활동, 실습, 현장체험 사진이 등록되면 이곳에서 앨범으로 볼 수 있습니다.'));
      target.append(empty);return;
    }
    if(currentAlbum==='all'){
      const grid=make('div','album-grid');
      albums.forEach(a=>{
        const photos=allAlbumPhotos(a.id);
        const card=make('button','album-card');card.type='button';card.setAttribute('aria-label',a.title+' 앨범 열기');
        const cover=make('span','album-cover');
        const picked=photos.find(p=>p.id===a.coverPhotoId)||photos[0];
        if(picked){const img=make('img');img.src=safeURL(picked.src);img.alt=a.title+' 앨범 대표 사진';img.loading='lazy';cover.append(img);}
        cover.append(make('span','album-count',photos.length+'장'));
        const info=make('div','album-info');info.append(make('strong','',a.title),make('p','',a.description||'우리들의 활동 기록'));
        if(a.date)info.append(make('small','',a.date));
        card.append(cover,info);card.addEventListener('click',()=>{currentAlbum=a.id;drawGallery();$('gallery').scrollIntoView({behavior:'smooth'});});grid.append(card);
      });target.append(grid);
    } else {
      const album=albums.find(a=>a.id===currentAlbum);
      const back=make('button','album-back','← 전체 앨범');back.type='button';back.addEventListener('click',()=>{currentAlbum='all';drawGallery();});target.append(back);
      const heading=make('h3','album-heading',album.title);heading.style.margin='0 0 16px';target.append(heading);
      const photos=allAlbumPhotos(currentAlbum);visiblePhotos=photos;
      if(!photos.length){target.append(make('p','sub','이 앨범에 아직 등록된 사진이 없습니다.'));return;}
      const grid=make('div','photo-grid');photos.forEach((p,i)=>{
        const b=make('button','photo-card');b.type='button';b.setAttribute('aria-label',p.caption||`${i+1}번째 사진 확대`);
        const img=make('img');img.src=safeURL(p.src);img.alt=p.caption||album.title+' 활동사진';img.loading='lazy';b.append(img);
        if(p.caption)b.append(make('span','photo-label',p.caption));b.addEventListener('click',()=>openPhoto(i,b));grid.append(b);
      });target.append(grid);
    }
  }
  function openPhoto(index,source){photoIndex=index;openDialog('photo-dialog',source);renderPhoto();}
  function renderPhoto(){
    if(!visiblePhotos.length)return;
    photoIndex=(photoIndex+visiblePhotos.length)%visiblePhotos.length;
    const p=visiblePhotos[photoIndex];const a=(content.albums||[]).find(a=>a.id===p.albumId);
    const img=$('photo-large');img.src=safeURL(p.src);img.alt=p.caption||'활동사진';
    $('photo-dialog-title').textContent=(a&&a.title)||'활동사진';
    $('photo-dialog-caption').textContent=[p.caption,p.date].filter(Boolean).join(' · ');
    $('photo-counter').textContent=`${photoIndex+1} / ${visiblePhotos.length}`;
    $('photo-prev').hidden=visiblePhotos.length<2;$('photo-next').hidden=visiblePhotos.length<2;
  }
  function openDialog(id,source){previousFocus=source||document.activeElement;const d=$(id);d.classList.add('open');d.setAttribute('aria-hidden','false');document.body.style.overflow='hidden';d.querySelector('.dialog-close').focus();}
  function closeDialogs(){
    document.querySelectorAll('.dialog.open').forEach(d=>{d.classList.remove('open');d.setAttribute('aria-hidden','true');});
    if(ytListenTimer){clearInterval(ytListenTimer);ytListenTimer=null;}const frame=$('video-frame');const playingVideo=frame.querySelector('video');if(playingVideo)playingVideo.pause();clearNode(frame);$('video-dialog').classList.remove('video-portrait');setFallback('');
    $('photo-large').removeAttribute('src');document.body.style.overflow='';if(previousFocus&&previousFocus.focus)previousFocus.focus();
  }
  document.querySelectorAll('.dialog-close').forEach(b=>b.addEventListener('click',closeDialogs));
  document.querySelectorAll('.dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d)closeDialogs();}));
  $('photo-prev').addEventListener('click',()=>{photoIndex--;renderPhoto();});
  $('photo-next').addEventListener('click',()=>{photoIndex++;renderPhoto();});
  document.addEventListener('keydown',(e)=>{
    const photo=$('photo-dialog').classList.contains('open');const video=$('video-dialog').classList.contains('open');
    if(e.key==='Escape'&&(photo||video))closeDialogs();
    if(photo&&e.key==='ArrowLeft'){photoIndex--;renderPhoto();}
    if(photo&&e.key==='ArrowRight'){photoIndex++;renderPhoto();}
    if((photo||video)&&e.key==='Tab'){
      const d=photo?$('photo-dialog'):$('video-dialog');const focusables=Array.from(d.querySelectorAll('button:not([hidden]),[href],video[controls]'));
      if(!focusables.length)return;const first=focusables[0],last=focusables[focusables.length-1];
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
    }
  });
  const navLinks=[...document.querySelectorAll('.nav-links a')];
  navLinks.forEach(a=>a.addEventListener('click',()=>{navLinks.forEach(n=>n.classList.remove('active'));a.classList.add('active');}));
  async function start(){
    try{
      const res=await fetch('/.netlify/functions/content',{cache:'no-store'});
      if(res.ok){const obj=await res.json();if(obj&&obj.site&&Array.isArray(obj.videos))content=obj;}
    }catch(e){ /* 배포 전 로컬 미리보기는 원본 데이터 표시 */ }
    loadSite();drawVideos();drawGallery();
  }
  start();
})();
