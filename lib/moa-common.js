/* HANAI Tools 공통 스크립트 */
(function(){
const Moa = {};
Moa.$ = (s, r=document) => r.querySelector(s);
Moa.$$ = (s, r=document) => [...r.querySelectorAll(s)];
Moa.el = function(tag, attrs, ...kids){
  const e = document.createElement(tag);
  if (attrs) for (const k in attrs){
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k in e && typeof v !== 'string') e[k] = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) e.append(c instanceof Node ? c : document.createTextNode(c));
  return e;
};
Moa.esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* 아이콘 (선 아이콘, 24x24) */
const I = {
  open:'<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v1H3z"/><path d="M3 10h18l-2 9H5z"/>',
  folder:'<path d="M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/>',
  file:'<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5"/>',
  save:'<path d="M5 3h11l3 3v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z"/><path d="M8 3v5h7V3M8 21v-7h8v7"/>',
  plus:'<path d="M12 5v14M5 12h14"/>', minus:'<path d="M5 12h14"/>',
  trash:'<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  x:'<path d="M6 6l12 12M18 6 6 18"/>',
  check:'<path d="M5 12l5 5 9-10"/>',
  play:'<path d="M7 5v14l11-7z" fill="currentColor"/>',
  pause:'<path d="M7 5h3v14H7zM14 5h3v14h-3z" fill="currentColor"/>',
  stop:'<rect x="6" y="6" width="12" height="12" fill="currentColor"/>',
  prev:'<path d="M6 5v14M19 5 9 12l10 7z" fill="currentColor"/>',
  next:'<path d="M18 5v14M5 5l10 7-10 7z" fill="currentColor"/>',
  shuffle:'<path d="M3 7h3c4 0 6 10 10 10h4M3 17h3c1.6 0 2.8-1.5 3.9-3.4M14.1 9.4C15.2 8 16.4 7 18 7h2M17 4l3 3-3 3M17 14l3 3-3 3"/>',
  repeat:'<path d="M4 11V9a2 2 0 0 1 2-2h13l-3-3M20 13v2a2 2 0 0 1-2 2H5l3 3"/>',
  vol:'<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>',
  mute:'<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9l5 6M22 9l-5 6"/>',
  eq:'<path d="M4 20v-6M4 10V4M12 20v-8M12 8V4M20 20v-4M20 12V4M2 14h4M10 8h4M18 16h4"/>',
  lyrics:'<path d="M4 6h16M4 10h10M4 14h16M4 18h8"/>',
  timer:'<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/>',
  palette:'<path d="M12 3a9 9 0 1 0 0 18c1 0 1.5-.8 1.5-1.5 0-1.2-1-1.5-1-2.5S13.3 15 14.5 15H17a4 4 0 0 0 4-4c0-4.4-4-8-9-8z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7.5" r="1"/>',
  gear:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  help:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5v.01"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/>',
  edit:'<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/>',
  tag:'<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.5"/>',
  pip:'<rect x="3" y="5" width="18" height="14" rx="2"/><rect x="12" y="11" width="7" height="6" rx="1"/>',
  sort:'<path d="M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4"/>',
  search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  zip:'<path d="M6 3h9l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M10 3v2h2v2h-2v2h2v2h-2v2h2"/><rect x="9.5" y="14" width="3" height="4" rx="1"/>',
  unzip:'<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M12 10v6M9 13l3 3 3-3"/>',
  up:'<path d="M12 19V5M5 12l7-7 7 7"/>',
  down:'<path d="M12 5v14M5 12l7 7 7-7"/>',
  lock:'<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  shield:'<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  eye:'<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  image:'<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="M21 16l-5-5-9 9"/>',
  rotL:'<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  rotR:'<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  flipH:'<path d="M12 3v18M8 7l-5 5 5 5zM16 7l5 5-5 5z"/>',
  flipV:'<path d="M3 12h18M7 8l5-5 5 5zM7 16l5 5 5-5z"/>',
  zoomIn:'<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4M11 8v6M8 11h6"/>',
  zoomOut:'<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4M8 11h6"/>',
  fit:'<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  full:'<path d="M3 8V3h5M21 8V3h-5M3 16v5h5M21 16v5h-5"/>',
  slideshow:'<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M10 8v5l4-2.5zM8 21h8"/>',
  crop:'<path d="M6 2v14a2 2 0 0 0 2 2h14M2 6h14a2 2 0 0 1 2 2v14"/>',
  resize:'<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>',
  adjust:'<circle cx="12" cy="12" r="9"/><path d="M12 3v18" /><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/>',
  text:'<path d="M5 6V4h14v2M12 4v16M9 20h6"/>',
  pen:'<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  arrow:'<path d="M5 19 19 5M10 5h9v9"/>',
  rect:'<rect x="4" y="6" width="16" height="12" rx="1"/>',
  ellipse:'<ellipse cx="12" cy="12" rx="9" ry="6.5"/>',
  line:'<path d="M5 19 19 5"/>',
  highlight:'<path d="M9 11l-6 6v3h9l3-3M22 12l-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/>',
  mosaic:'<rect x="3" y="3" width="6" height="6"/><rect x="9" y="9" width="6" height="6"/><rect x="15" y="3" width="6" height="6"/><rect x="3" y="15" width="6" height="6"/><rect x="15" y="15" width="6" height="6"/>',
  number:'<circle cx="12" cy="12" r="9"/><path d="M10 9l2-1v8"/>',
  undo:'<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
  redo:'<path d="m15 14 5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/>',
  copy:'<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
  camera:'<path d="M3 8a2 2 0 0 1 2-2h2l2-2h6l2 2h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="4"/>',
  monitor:'<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
  window:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/>',
  region:'<path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4"/><rect x="8" y="8" width="8" height="8" stroke-dasharray="2 2"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  dropper:'<path d="M2 22l1-4L14 7l3 3L6 21zM14 7l3-3a2.1 2.1 0 0 1 3 3l-3 3"/>',
  merge:'<path d="M6 3v6a6 6 0 0 0 6 6h0a6 6 0 0 1 6 6M18 3v6a6 6 0 0 1-6 6"/>',
  split:'<path d="M12 3v6M12 9 6 15v6M12 9l6 6v6"/>',
  pages:'<rect x="7" y="3" width="12" height="16" rx="1"/><path d="M5 7v13a1 1 0 0 0 1 1h10"/>',
  watermark:'<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
  sign:'<path d="M3 17c3-1 4-8 6-8s0 8 2 8 3-4 4-4 1 3 3 3h3M3 21h18"/>',
  print:'<path d="M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2"/><rect x="6" y="14" width="12" height="7"/>',
  grid:'<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>',
  list:'<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  convert:'<path d="M4 7h13l-3-3M20 17H7l3 3"/>',
  music:'<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  star:'<path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/>',
  home:'<path d="M3 11 12 4l9 7M5 10v10h14V10"/>',
  refresh:'<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>',
  test:'<path d="M9 3h6M10 3v6L4 19a1 1 0 0 0 .9 1.5h14.2A1 1 0 0 0 20 19l-6-10V3"/>',
  comment:'<path d="M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12z"/>',
  hash:'<path d="M5 9h14M5 15h14M10 3 8 21M16 3l-2 18"/>',
  ab:'<path d="M3 18 6.5 6 10 18M4.2 14h4.6M14 6v12h3.5a3 3 0 0 0 0-6H14h3a3 3 0 0 0 0-6z"/>',
  speed:'<path d="M12 14l4-4"/><path d="M3.3 17a9 9 0 1 1 17.4 0"/>',
  record:'<circle cx="12" cy="12" r="7" fill="currentColor"/>',
};
Moa.icon = (name, extra='') => `<svg viewBox="0 0 24 24" ${extra}>${I[name]||''}</svg>`;
Moa.icons = I;

/* 툴바 버튼 생성: [{id, icon, label, title, onClick}] 또는 '|' */
Moa.toolbar = function(container, items){
  for (const it of items){
    if (it === '|'){ container.append(Moa.el('div',{class:'tb-sep'})); continue; }
    const b = Moa.el('button',{class:'tb', id:it.id||null, title:it.title||it.label, html:Moa.icon(it.icon)+`<span>${Moa.esc(it.label)}</span>`});
    if (it.onClick) b.addEventListener('click', it.onClick);
    container.append(b);
  }
};

/* 토스트 */
let toastEl, toastT;
Moa.toast = function(msg, ms=2000){
  if (!toastEl){ toastEl = Moa.el('div',{class:'moa-toast'}); document.body.append(toastEl); }
  toastEl.textContent = msg; toastEl.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(()=>toastEl.classList.remove('show'), ms);
};

/* 모달 */
Moa.modal = function({title, body, buttons=[{label:'닫기', primary:true}], width, onClose, closeOnBg=true}){
  return new Promise(resolve => {
    const bg = Moa.el('div',{class:'moa-modal-bg'});
    const box = Moa.el('div',{class:'moa-modal', style: width?{width: typeof width==='number'? width+'px': width}:null});
    const close = (v) => { bg.remove(); document.removeEventListener('keydown', onKey, true); onClose && onClose(v); resolve(v); };
    const head = Moa.el('header',null, title||'', Moa.el('button',{class:'ibtn x', html:Moa.icon('x'), onclick:()=>close(null)}));
    const bd = Moa.el('div',{class:'body'});
    if (typeof body === 'string') bd.innerHTML = body; else if (body) bd.append(body);
    const ft = Moa.el('footer');
    buttons.forEach(b => {
      const btn = Moa.el('button',{class:'btn'+(b.primary?' primary':'')+(b.danger?' danger':'')}, b.label);
      btn.onclick = async () => {
        if (b.onClick){ const r = await b.onClick(bd, btn); if (r === false) return; close(r === undefined ? (b.value ?? b.label) : r); }
        else close(b.value ?? b.label);
      };
      ft.append(btn);
    });
    box.append(head, bd); if (buttons.length) box.append(ft);
    bg.append(box); document.body.append(bg);
    if (closeOnBg) bg.addEventListener('mousedown', e => { if (e.target === bg) close(null); });
    function onKey(e){
      if (e.key === 'Escape'){ e.stopPropagation(); close(null); }
      else if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'BUTTON'){
        const p = buttons.find(b=>b.primary); if (p){ e.preventDefault(); ft.children[buttons.indexOf(p)].click(); }
      }
    }
    document.addEventListener('keydown', onKey, true);
    setTimeout(()=>{ const f = bd.querySelector('input,select,textarea'); if (f){ f.focus(); f.select && f.select(); } }, 30);
    Moa._lastModal = {bg, body:bd, close};
  });
};
Moa.prompt = function(title, value='', {type='text', placeholder=''}={}){
  const inp = Moa.el('input',{type, value, placeholder, style:{width:'100%'}});
  return Moa.modal({title, body:inp, buttons:[{label:'취소', value:null},{label:'확인', primary:true, onClick:()=>inp.value}]});
};
Moa.confirm = function(msg, title='확인'){
  return Moa.modal({title, body:Moa.el('div',{style:{whiteSpace:'pre-wrap'}}, msg), buttons:[{label:'취소', value:false},{label:'확인', primary:true, value:true}]}).then(v=>!!v);
};
Moa.alert = (msg, title='알림') => Moa.modal({title, body:Moa.el('div',{style:{whiteSpace:'pre-wrap'}}, msg)});

/* 컨텍스트 메뉴: items [{label, hint, onClick, disabled}] 또는 '-' */
let menuEl;
Moa.menu = function(x, y, items){
  Moa.closeMenu();
  menuEl = Moa.el('div',{class:'moa-menu'});
  items.forEach(it => {
    if (it === '-'){ menuEl.append(Moa.el('div',{class:'sep'})); return; }
    const b = Moa.el('button',{disabled:!!it.disabled}, Moa.el('span',null,it.label), it.hint?Moa.el('span',{class:'hint'},it.hint):null);
    b.onclick = () => { Moa.closeMenu(); it.onClick && it.onClick(); };
    menuEl.append(b);
  });
  document.body.append(menuEl);
  const r = menuEl.getBoundingClientRect();
  menuEl.style.left = Math.min(x, innerWidth - r.width - 6) + 'px';
  menuEl.style.top = Math.min(y, innerHeight - r.height - 6) + 'px';
  setTimeout(()=>document.addEventListener('mousedown', outside, true), 0);
  function outside(e){ if (menuEl && !menuEl.contains(e.target)){ Moa.closeMenu(); } }
  Moa._menuOutside = outside;
};
Moa.closeMenu = function(){ if (menuEl){ menuEl.remove(); menuEl = null; document.removeEventListener('mousedown', Moa._menuOutside, true); } };
document.addEventListener('keydown', e => { if (e.key === 'Escape') Moa.closeMenu(); });

/* 포맷 */
Moa.fmtTime = s => { if (!isFinite(s) || s < 0) s = 0; s = Math.floor(s); const h = Math.floor(s/3600), m = Math.floor(s%3600/60), x = s%60; return (h? h+':'+String(m).padStart(2,'0') : m) + ':' + String(x).padStart(2,'0'); };
Moa.fmtBytes = n => { if (n == null || !isFinite(n)) return '-'; const u = ['B','KB','MB','GB','TB']; let i = 0; while (n >= 1024 && i < u.length-1){ n /= 1024; i++; } return (i? n.toFixed(n<10?2:1) : n) + ' ' + u[i]; };
Moa.fmtDate = d => { if (!d) return '-'; d = new Date(d); const p = n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; };

/* 파일 저장 (다운로드) */
Moa.download = function(blob, name){
  const a = Moa.el('a',{href:URL.createObjectURL(blob), download:name});
  document.body.append(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href), 60000);
};
/* 다른 이름으로 저장: File System Access API 지원 시 저장 위치 선택 */
Moa.saveAs = async function(blob, name, types){
  if (window.showSaveFilePicker){
    try{
      const ext = (name.match(/\.[^.]+$/)||[''])[0];
      const h = await showSaveFilePicker({suggestedName:name, types: types || (ext? [{description:ext.slice(1).toUpperCase()+' 파일', accept:{[blob.type||'application/octet-stream']:[ext]}}] : undefined)});
      const w = await h.createWritable(); await w.write(blob); await w.close();
      Moa.toast('저장했습니다: ' + h.name); return true;
    }catch(e){ if (e.name === 'AbortError') return false; console.warn(e); }
  }
  Moa.download(blob, name); return true;
};

/* 텍스트 인코딩 자동 판별 (UTF-8 / UTF-16 / CP949) */
Moa.decodeText = function(bytes){
  if (!(bytes instanceof Uint8Array)) bytes = new Uint8Array(bytes);
  if (bytes[0]===0xEF && bytes[1]===0xBB && bytes[2]===0xBF) return new TextDecoder('utf-8').decode(bytes.subarray(3));
  if (bytes[0]===0xFF && bytes[1]===0xFE) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  if (bytes[0]===0xFE && bytes[1]===0xFF) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  try { return new TextDecoder('utf-8',{fatal:true}).decode(bytes); }
  catch(e){ try { return new TextDecoder('euc-kr').decode(bytes); } catch(e2){ return new TextDecoder('latin1').decode(bytes); } }
};
Moa.readText = async file => Moa.decodeText(new Uint8Array(await file.arrayBuffer()));

/* CRC32 */
const CRC_T = (()=>{ const t = new Uint32Array(256); for (let n=0;n<256;n++){ let c=n; for (let k=0;k<8;k++) c = c&1 ? 0xEDB88320^(c>>>1) : c>>>1; t[n]=c>>>0; } return t; })();
Moa.crc32 = function(data, crc=0){ crc = crc ^ 0xFFFFFFFF; for (let i=0;i<data.length;i++) crc = CRC_T[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8); return (crc ^ 0xFFFFFFFF) >>> 0; };
Moa.CRC_TABLE = CRC_T;

/* 저장소 (localStorage 안전 래퍼) */
Moa.store = {
  get(k, d){ try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch(e){ return d; } },
  set(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} }
};

/* 테마 */
Moa.THEMES = {dark:'다크', light:'라이트', pink:'핑크', green:'그린', silver:'실버'};
Moa.applyTheme = function(appKey){ const t = Moa.store.get('moa.theme.'+appKey, Moa.store.get('moa.theme', 'dark')); document.documentElement.dataset.theme = t; return t; };
Moa.themeMenu = function(appKey, x, y, after){
  const cur = document.documentElement.dataset.theme;
  Moa.menu(x, y, Object.entries(Moa.THEMES).map(([k,v]) => ({label:(k===cur?'● ':'○ ')+v+' 스킨', onClick:()=>{ document.documentElement.dataset.theme = k; Moa.store.set('moa.theme.'+appKey, k); after && after(k); }})));
};

/* 드래그 앤 드롭으로 파일/폴더 받기 (폴더는 재귀 탐색, path 속성 부여) */
Moa.collectDropped = async function(dt){
  const items = dt.items ? [...dt.items] : [];
  const entries = items.map(i => i.webkitGetAsEntry && i.webkitGetAsEntry()).filter(Boolean);
  if (!entries.length) return [...dt.files].map(f => (f.relPath = f.name, f));
  const out = [];
  async function walk(entry, prefix){
    if (entry.isFile){
      const f = await new Promise((res, rej) => entry.file(res, rej));
      f.relPath = prefix + f.name; out.push(f);
    } else if (entry.isDirectory){
      const reader = entry.createReader();
      let batch;
      do {
        batch = await new Promise((res, rej) => reader.readEntries(res, rej));
        for (const e of batch) await walk(e, prefix + entry.name + '/');
      } while (batch.length);
    }
  }
  for (const e of entries) await walk(e, '');
  return out;
};
Moa.enableDrop = function(onFiles, hintText='여기에 놓으세요'){
  let hint, depth = 0;
  const show = () => { if (!hint){ hint = Moa.el('div',{class:'dropzone-hint'}, hintText); document.body.append(hint); } };
  const hide = () => { depth = 0; if (hint){ hint.remove(); hint = null; } };
  window.addEventListener('dragenter', e => { if ([...(e.dataTransfer?.types||[])].includes('Files')){ e.preventDefault(); depth++; show(); } });
  window.addEventListener('dragover', e => { if ([...(e.dataTransfer?.types||[])].includes('Files')) e.preventDefault(); });
  window.addEventListener('dragleave', e => { if (--depth <= 0) hide(); });
  window.addEventListener('drop', async e => {
    if (!e.dataTransfer || !e.dataTransfer.files.length){ hide(); return; }
    e.preventDefault(); hide();
    const files = await Moa.collectDropped(e.dataTransfer);
    onFiles(files);
  });
};
/* 파일 선택창 */
Moa.pickFiles = function({accept='', multiple=true, directory=false}={}){
  return new Promise(resolve => {
    const inp = Moa.el('input',{type:'file', accept, multiple, style:{display:'none'}});
    if (directory){ inp.webkitdirectory = true; }
    inp.onchange = () => { const fs = [...inp.files]; fs.forEach(f => f.relPath = f.webkitRelativePath || f.name); inp.remove(); resolve(fs); };
    inp.addEventListener('cancel', () => { inp.remove(); resolve([]); });
    document.body.append(inp); inp.click();
  });
};

/* 이미지 Blob → HTMLImageElement */
Moa.loadImage = src => new Promise((res, rej) => { const img = new Image(); img.onload = () => res(img); img.onerror = rej; img.src = typeof src === 'string' ? src : URL.createObjectURL(src); });
Moa.canvasToBlob = (cv, type='image/png', q=0.92) => new Promise(res => cv.toBlob(res, type, q));

/* 간단한 IndexedDB 키-값 저장소 */
Moa.idb = function(dbName, stores){
  let dbp;
  const open = () => dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open(dbName, 1);
    r.onupgradeneeded = () => stores.forEach(s => { if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s); });
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
  const tx = async (store, mode, fn) => { const db = await open(); return new Promise((res, rej) => { const t = db.transaction(store, mode); const s = t.objectStore(store); const r = fn(s); t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error); }); };
  return {
    get: (s, k) => tx(s, 'readonly', st => st.get(k)),
    set: (s, k, v) => tx(s, 'readwrite', st => st.put(v, k)),
    del: (s, k) => tx(s, 'readwrite', st => st.delete(k)),
    clear: s => tx(s, 'readwrite', st => st.clear()),
    keys: s => tx(s, 'readonly', st => st.getAllKeys()),
    all: s => tx(s, 'readonly', st => st.getAll()),
  };
};

/* 단축키 도움말 표 */
Moa.shortcutTable = rows => '<table class="grid-list" style="font-size:13px">' + rows.map(([k,d]) => `<tr><td style="max-width:none;width:42%">${k.split('+').map(x=>`<span class="kbd">${Moa.esc(x)}</span>`).join(' + ')}</td><td style="max-width:none">${Moa.esc(d)}</td></tr>`).join('') + '</table>';

window.Moa = Moa;
})();
