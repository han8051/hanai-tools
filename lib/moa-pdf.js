/* HANAI PDF: pdf.js(보기) / pdf-lib(편집) 연결 도우미 — 인터넷 없이 file:// 에서 동작 */
(function(){
const P = {};
let workerPort = null;
P.init = function(){
  if (workerPort) return;
  const url = URL.createObjectURL(new Blob([window.PDFJS_WORKER_CODE], {type:'text/javascript'}));
  workerPort = new Worker(url);
  pdfjsLib.GlobalWorkerOptions.workerPort = workerPort;
};
const b64cache = new Map();
function fromB64(s){ const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
class EmbeddedDataFactory {
  constructor(){}
  async fetch({kind, filename}){
    const key = kind + '/' + filename;
    if (b64cache.has(key)) return b64cache.get(key).slice();
    const s = window.PDFJS_DATA && PDFJS_DATA[kind] && PDFJS_DATA[kind][filename];
    if (!s) throw new Error('내장 데이터 없음: ' + key);
    const u = fromB64(s); b64cache.set(key, u); return u.slice();
  }
}
/* bytes: Uint8Array, onPassword: async (retry) => string|null */
P.load = async function(bytes, onPassword){
  P.init();
  const task = pdfjsLib.getDocument({data: bytes.slice(), BinaryDataFactory: EmbeddedDataFactory, cMapPacked:true, useWorkerFetch:false, isEvalSupported:false, enableXfa:false});
  let used = null;
  if (onPassword){
    task.onPassword = async (update, reason) => {
      const pw = await onPassword(reason === pdfjsLib.PasswordResponses.INCORRECT_PASSWORD);
      if (pw == null){ task.destroy(); return; }
      used = pw; update(pw);
    };
  }
  const doc = await task.promise;
  doc._password = used;
  return doc;
};
/* 페이지를 캔버스로 렌더링 */
P.renderPage = async function(page, scale, rotation=0, canvas){
  const vp = page.getViewport({scale, rotation: (page.rotate + rotation) % 360});
  canvas = canvas || document.createElement('canvas');
  const dpr = 1;
  canvas.width = Math.max(1, Math.floor(vp.width * dpr)); canvas.height = Math.max(1, Math.floor(vp.height * dpr));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({canvasContext: ctx, canvas, viewport: vp, transform: dpr !== 1 ? [dpr,0,0,dpr,0,0] : null}).promise;
  return {canvas, viewport: vp};
};
/* 페이지 범위 문자열 "1-3, 5, 8-" → [0,1,2,4,7,...] */
P.parseRanges = function(str, total){
  const groups = [];
  for (const part of String(str).split(/[,;]/)){
    const s = part.trim(); if (!s) continue;
    let m = s.match(/^(\d*)\s*[-~]\s*(\d*)$/);
    if (m){ const a = m[1] ? +m[1] : 1, b = m[2] ? +m[2] : total; const g = []; for (let i = Math.max(1, a); i <= Math.min(total, b); i++) g.push(i - 1); if (a > b) for (let i = Math.min(total, a); i >= Math.max(1, b); i--) g.push(i - 1); if (g.length) groups.push(g); }
    else if (/^\d+$/.test(s)){ const n = +s; if (n >= 1 && n <= total) groups.push([n - 1]); }
    else throw new Error('페이지 범위를 이해할 수 없습니다: ' + s);
  }
  return groups;
};
window.MoaPDF = P;
})();
