/* HANAI Plus 온라인 부품 불러오기: 문자 인식(tesseract.js), MP3 인코더(lamejs)
   처음 쓸 때 인터넷(jsdelivr)에서 받아 이 브라우저에 저장해 두고, 다음부터는 저장본을 씁니다. */
(function(){
const O = {};
const LIBS = {
  lame: {url:'https://cdn.jsdelivr.net/npm/lamejs@1.2.1/lame.min.js', global:'lamejs', name:'MP3 인코더'},
  tesseract: {url:'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js', global:'Tesseract', name:'문자 인식(OCR) 엔진'}
};
const db = Moa.idb('hanai-online', ['libs']);
const loading = {};
function injectText(code){
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = URL.createObjectURL(new Blob([code], {type:'text/javascript'}));
    s.onload = () => res(); s.onerror = () => rej(new Error('스크립트 실행 실패'));
    document.head.append(s);
  });
}
function injectUrl(url){
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = url; s.onload = () => res(); s.onerror = () => rej(new Error('불러오기 실패')); document.head.append(s); });
}
O.load = function(key){
  const L = LIBS[key];
  if (window[L.global]) return Promise.resolve(window[L.global]);
  if (loading[key]) return loading[key];
  loading[key] = (async () => {
    // 1) 이 브라우저에 저장해 둔 사본
    try { const code = await db.get('libs', key); if (code){ await injectText(code); if (window[L.global]) return window[L.global]; } } catch(e){}
    // 2) 인터넷에서 받기 (받은 내용은 저장)
    try {
      const r = await fetch(L.url, {cache:'force-cache'});
      if (!r.ok) throw new Error('서버 응답 ' + r.status);
      const code = await r.text();
      await injectText(code);
      if (window[L.global]){ try { await db.set('libs', key, code); } catch(e){} return window[L.global]; }
    } catch(e){
      // 3) 마지막으로 script 태그로 직접
      try { await injectUrl(L.url); if (window[L.global]) return window[L.global]; } catch(e2){}
    }
    loading[key] = null;
    throw new Error(`${L.name}를 불러올 수 없습니다. 이 기능은 처음 한 번 인터넷 연결이 필요합니다.`);
  })();
  return loading[key];
};
O.isCached = async key => { try { return !!(await db.get('libs', key)); } catch(e){ return false; } };

/* ---------- MP3 ---------- */
/* chans: Float32Array[] (1~2채널), sr: 샘플레이트, kbps */
O.encodeMP3 = async function(chans, sr, kbps=192, onProgress){
  const lame = await O.load('lame');
  const ch = Math.min(2, chans.length), len = chans[0].length;
  if (![8000,11025,12000,16000,22050,24000,32000,44100,48000].includes(sr)) throw new Error('MP3는 이 샘플레이트(' + sr + 'Hz)를 지원하지 않습니다. 44100Hz로 바꿔 주세요.');
  const enc = new lame.Mp3Encoder(ch, sr, kbps);
  const toI16 = (f, a, b) => { const o = new Int16Array(b - a); for (let i = a; i < b; i++){ const x = Math.max(-1, Math.min(1, f[i])); o[i - a] = x < 0 ? x * 32768 : x * 32767; } return o; };
  const parts = []; const block = 1152 * 20;
  for (let i = 0; i < len; i += block){
    const e = Math.min(len, i + block);
    const l = toI16(chans[0], i, e), r = ch > 1 ? toI16(chans[1], i, e) : null;
    const out = ch > 1 ? enc.encodeBuffer(l, r) : enc.encodeBuffer(l);
    if (out.length) parts.push(new Uint8Array(out));
    if (onProgress && (i / block) % 20 === 0){ onProgress(i / len); await new Promise(r => setTimeout(r, 0)); }
  }
  const end = enc.flush(); if (end.length) parts.push(new Uint8Array(end));
  return new Blob(parts, {type:'audio/mpeg'});
};

/* ---------- 문자 인식 ---------- */
O.LANGS = [['kor+eng','한국어 + 영어'],['eng','영어'],['kor','한국어'],['jpn+eng','일본어 + 영어'],['chi_sim+eng','중국어(간체) + 영어'],['chi_tra+eng','중국어(번체) + 영어']];
let worker = null, workerLang = null;
async function getWorker(lang, onStatus){
  const T = await O.load('tesseract');
  if (worker && workerLang === lang) return worker;
  if (worker){ try { await worker.terminate(); } catch(e){} worker = null; }
  onStatus && onStatus('언어 데이터 준비 중… (처음에는 몇 MB를 내려받습니다)');
  worker = await T.createWorker(lang.split('+'), 1, {
    logger: m => { if (onStatus && m && m.status) onStatus(statusKo(m.status) + (m.progress ? ' ' + Math.round(m.progress * 100) + '%' : '')); }
  });
  workerLang = lang;
  return worker;
}
function statusKo(s){ return ({'loading tesseract core':'인식 엔진 불러오는 중','initializing tesseract':'인식 엔진 준비 중','loading language traineddata':'언어 데이터 불러오는 중','loading language traineddata (from cache)':'언어 데이터 불러오는 중 (저장본)','initializing api':'준비 중','recognizing text':'글자 인식 중'})[s] || s; }
/* image: canvas/이미지/Blob. opts {lang, pdf:boolean, dpi, onStatus} → {text, pdf(Uint8Array|null), confidence} */
O.ocr = async function(image, opts={}){
  const w = await getWorker(opts.lang || 'kor+eng', opts.onStatus);
  try { await w.setParameters({user_defined_dpi: String(opts.dpi || 300), preserve_interword_spaces: '1'}); } catch(e){}
  const res = await w.recognize(image, opts.pdf ? {pdfTitle:'HANAI OCR'} : {}, opts.pdf ? {text:true, pdf:true} : {text:true});
  const d = res.data || {};
  let text = d.text || '';
  // 한글 글자 사이 불필요한 띄어쓰기 줄이기
  if (/kor/.test(opts.lang || 'kor')) text = text.replace(/([가-힣]) (?=[가-힣] )/g, '$1');
  return {text, confidence: d.confidence, pdf: d.pdf ? new Uint8Array(d.pdf) : null};
};
O.endOCR = async () => { if (worker){ try { await worker.terminate(); } catch(e){} worker = null; workerLang = null; } };
/* 결과 보여주기 (복사·저장) */
O.showText = function(text, title='문자 인식 결과', fileBase='인식한 글자'){
  const ta = Moa.el('textarea',{style:{width:'min(720px,86vw)', height:'55vh', fontFamily:'inherit', fontSize:'14px', lineHeight:'1.6'}}); ta.value = text;
  return Moa.modal({title, body: Moa.el('div',null, text.trim() ? null : Moa.el('div',{style:{color:'var(--warn)', marginBottom:'6px'}}, '글자를 찾지 못했습니다. 더 선명한 그림이나 높은 해상도로 다시 해 보세요.'), ta, Moa.el('div',{class:'dim', style:{fontSize:'11.5px', marginTop:'6px'}}, '인식 결과에는 틀린 글자가 있을 수 있으니 꼭 확인하세요.')), width:'auto', buttons:[
    {label:'복사', onClick:()=>{ navigator.clipboard.writeText(ta.value).then(()=>Moa.toast('복사했습니다')).catch(()=>Moa.toast('복사할 수 없습니다')); return false; }},
    {label:'TXT로 저장', onClick:()=>{ Moa.saveAs(new Blob(['﻿' + ta.value], {type:'text/plain'}), fileBase + '.txt'); return false; }},
    {label:'닫기', primary:true}]});
};
/* 언어 고르기 + 진행 창 */
O.langSelect = (cur) => { const s = Moa.el('select',null, ...O.LANGS.map(([v, n]) => Moa.el('option',{value:v, selected:v === cur}, n))); return s; };
O.progress = function(title){
  const bar = Moa.el('i'), txt = Moa.el('div',{class:'dim', style:{fontSize:'12px', marginTop:'8px', width:'360px'}}, '준비 중…');
  const st = {cancelled:false};
  Moa.modal({title, body: Moa.el('div',null, Moa.el('div',{class:'progress'}, bar), txt), closeOnBg:false, buttons:[{label:'취소', onClick:()=>{ st.cancelled = true; }}]});
  const m = Moa._lastModal;
  st.set = (f, t) => { if (f != null) bar.style.width = Math.round(f * 100) + '%'; if (t != null) txt.textContent = t; };
  st.close = () => m.close();
  return st;
};
window.MoaOnline = O;
})();

