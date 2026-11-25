/* HANAI View 이미지 도우미: EXIF 읽기, GIF 인코더, 픽셀 연산 */
(function(){
const M = {};

/* ---------------- EXIF ---------------- */
const TAGS = {0x010F:'make',0x0110:'model',0x0112:'orientation',0x0131:'software',0x0132:'dateTime',0x013B:'artist',0x8298:'copyright',
  0x829A:'exposureTime',0x829D:'fNumber',0x8822:'exposureProgram',0x8827:'iso',0x9003:'dateTaken',0x9204:'exposureBias',0x9207:'meteringMode',
  0x9209:'flash',0x920A:'focalLength',0xA002:'pixelX',0xA003:'pixelY',0xA403:'whiteBalance',0xA405:'focal35',0xA434:'lens',0xA433:'lensMake',0x9286:'userComment',0xA420:'imageId'};
const GPS = {1:'latRef',2:'lat',3:'lonRef',4:'lon',5:'altRef',6:'alt',29:'gpsDate'};
M.readExif = async function(file){
  try {
    const buf = new Uint8Array(await file.slice(0, 256 * 1024).arrayBuffer());
    if (buf[0] !== 0xFF || buf[1] !== 0xD8) return null;
    let p = 2;
    while (p + 4 < buf.length){
      if (buf[p] !== 0xFF) break;
      const mk = buf[p+1], len = buf[p+2] << 8 | buf[p+3];
      if (mk === 0xE1 && buf[p+4] === 0x45 && buf[p+5] === 0x78 && buf[p+6] === 0x69 && buf[p+7] === 0x66) return parseTiff(buf.subarray(p + 10, p + 2 + len));
      if (mk === 0xDA) break;
      p += 2 + len;
    }
  } catch(e){ console.warn(e); }
  return null;
};
function parseTiff(b){
  const le = b[0] === 0x49;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const u16 = o => dv.getUint16(o, le), u32 = o => dv.getUint32(o, le), s32 = o => dv.getInt32(o, le);
  const out = {};
  const sizes = {1:1,2:1,3:2,4:4,5:8,7:1,9:4,10:8};
  function readVal(type, count, off){
    const sz = sizes[type] || 1, total = sz * count;
    const at = total <= 4 ? off : u32(off);
    if (at + total > b.length) return null;
    const one = i => { const o = at + i * sz; switch(type){ case 1: case 7: return b[o]; case 3: return u16(o); case 4: return u32(o); case 9: return s32(o); case 5: { const d = u32(o+4); return d ? u32(o) / d : 0; } case 10: { const d = s32(o+4); return d ? s32(o) / d : 0; } } };
    if (type === 2){ let s = ''; for (let i = 0; i < count - 1 && at + i < b.length; i++){ if (!b[at+i]) break; s += String.fromCharCode(b[at+i]); } return s.trim(); }
    if (type === 7 && count > 4){ return new TextDecoder().decode(b.subarray(at + 8, at + total)).replace(/\0/g,'').trim(); }
    if (count === 1) return one(0);
    const arr = []; for (let i = 0; i < Math.min(count, 16); i++) arr.push(one(i)); return arr;
  }
  function ifd(off, map, depth){
    if (off <= 0 || off + 2 > b.length || depth > 3) return;
    const n = u16(off);
    for (let i = 0; i < n; i++){
      const e = off + 2 + i * 12; if (e + 12 > b.length) break;
      const tag = u16(e), type = u16(e+2), count = u32(e+4);
      if (map === TAGS && tag === 0x8769){ ifd(u32(e+8), TAGS, depth+1); continue; }
      if (map === TAGS && tag === 0x8825){ ifd(u32(e+8), GPS, depth+1); continue; }
      const k = map[tag]; if (!k) continue;
      const v = readVal(type, count, e + 8);
      out[k] = v;
    }
  }
  ifd(u32(4), TAGS, 0);
  for (const k of ['exposureTime','fNumber','focalLength','exposureBias','alt']) if (Array.isArray(out[k]) && out[k].length === 2) out[k] = out[k][1] ? out[k][0] / out[k][1] : 0;
  if (Array.isArray(out.lat) && Array.isArray(out.lon)){
    const dms = a => a[0] + a[1]/60 + a[2]/3600;
    out.gps = {lat: dms(out.lat) * (out.latRef === 'S' ? -1 : 1), lon: dms(out.lon) * (out.lonRef === 'W' ? -1 : 1), alt: out.alt};
  }
  return out;
}
M.exifRows = function(x){
  if (!x) return [];
  const r = [];
  const fmtExp = t => !t ? '' : t >= 1 ? t + '초' : '1/' + Math.round(1/t) + '초';
  if (x.make || x.model) r.push(['카메라', [x.make, x.model && x.make && x.model.startsWith(x.make) ? x.model.slice(x.make.length).trim() : x.model].filter(Boolean).join(' ')]);
  if (x.lens) r.push(['렌즈', x.lens]);
  if (x.dateTaken || x.dateTime) r.push(['촬영 날짜', (x.dateTaken || x.dateTime).replace(/^(\d+):(\d+):(\d+)/, '$1-$2-$3')]);
  if (x.exposureTime) r.push(['노출 시간', fmtExp(x.exposureTime)]);
  if (x.fNumber) r.push(['조리개', 'F' + (Math.round(x.fNumber * 10) / 10)]);
  if (x.iso) r.push(['ISO', Array.isArray(x.iso) ? x.iso[0] : x.iso]);
  if (x.focalLength) r.push(['초점 거리', Math.round(x.focalLength * 10) / 10 + 'mm' + (x.focal35 ? ` (35mm 환산 ${x.focal35}mm)` : '')]);
  if (x.exposureBias) r.push(['노출 보정', (x.exposureBias > 0 ? '+' : '') + Math.round(x.exposureBias * 10) / 10 + ' EV']);
  if (x.flash != null) r.push(['플래시', x.flash & 1 ? '사용' : '사용 안 함']);
  if (x.whiteBalance != null) r.push(['화이트 밸런스', x.whiteBalance ? '수동' : '자동']);
  if (x.exposureProgram) r.push(['촬영 모드', ['','수동','프로그램','조리개 우선','셔터 우선','크리에이티브','액션','인물','풍경'][x.exposureProgram] || x.exposureProgram]);
  if (x.software) r.push(['소프트웨어', x.software]);
  if (x.artist) r.push(['작성자', x.artist]);
  if (x.copyright) r.push(['저작권', x.copyright]);
  if (x.orientation && x.orientation !== 1) r.push(['방향', ['','기본','좌우 반전','180° 회전','상하 반전','회전+반전','90° 회전','회전+반전','270° 회전'][x.orientation]]);
  if (x.gps) r.push(['GPS', x.gps.lat.toFixed(6) + ', ' + x.gps.lon.toFixed(6) + (x.gps.alt ? ` (고도 ${Math.round(x.gps.alt)}m)` : '')]);
  return r;
};

/* ---------------- GIF 인코더 ---------------- */
function buildPalette(){
  const pal = [];
  for (let r = 0; r < 6; r++) for (let g = 0; g < 7; g++) for (let b = 0; b < 6; b++) pal.push([Math.round(r*255/5), Math.round(g*255/6), Math.round(b*255/5)]);
  while (pal.length < 256){ const v = Math.round((pal.length - 252) * 255 / 3); pal.push([v, v, v]); }
  return pal;
}
const PAL = buildPalette();
function quantize(data, w, h, dither){
  const idx = new Uint8Array(w * h);
  const err = dither ? new Float32Array(w * h * 3) : null;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++){
    const i = y * w + x, o = i * 4;
    let r = data[o], g = data[o+1], b = data[o+2];
    if (dither){ r += err[i*3]; g += err[i*3+1]; b += err[i*3+2]; }
    r = Math.max(0, Math.min(255, r)); g = Math.max(0, Math.min(255, g)); b = Math.max(0, Math.min(255, b));
    const ri = Math.round(r * 5 / 255), gi = Math.round(g * 6 / 255), bi = Math.round(b * 5 / 255);
    let k = ri * 42 + gi * 6 + bi;
    // 회색에 가까우면 회색 팔레트도 비교
    const c = PAL[k]; let best = (c[0]-r)**2 + (c[1]-g)**2 + (c[2]-b)**2;
    for (let q = 252; q < 256; q++){ const d = (PAL[q][0]-r)**2 + (PAL[q][1]-g)**2 + (PAL[q][2]-b)**2; if (d < best){ best = d; k = q; } }
    idx[i] = k;
    if (dither){
      const p = PAL[k], er = r - p[0], eg = g - p[1], eb = b - p[2];
      const add = (xx, yy, f) => { if (xx < 0 || xx >= w || yy >= h) return; const j = (yy * w + xx) * 3; err[j] += er * f; err[j+1] += eg * f; err[j+2] += eb * f; };
      add(x+1, y, 7/16); add(x-1, y+1, 3/16); add(x, y+1, 5/16); add(x+1, y+1, 1/16);
    }
  }
  return idx;
}
function lzw(indices, minCode){
  const out = []; let cur = 0, bits = 0;
  const emit = (code, size) => { cur |= code << bits; bits += size; while (bits >= 8){ out.push(cur & 255); cur >>>= 8; bits -= 8; } };
  const clear = 1 << minCode, eoi = clear + 1;
  let size = minCode + 1, next = eoi + 1;
  let dict = new Map();
  emit(clear, size);
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++){
    const k = indices[i], key = prefix * 256 + k;
    const got = dict.get(key);
    if (got !== undefined){ prefix = got; continue; }
    emit(prefix, size);
    if (next < 4096){ dict.set(key, next++); if (next > (1 << size) && size < 12) size++; }
    else { emit(clear, size); dict = new Map(); size = minCode + 1; next = eoi + 1; }
    prefix = k;
  }
  emit(prefix, size); emit(eoi, size);
  if (bits > 0) out.push(cur & 255);
  return out;
}
/* frames: [{canvas, delay(ms)}], opts {loop:0=무한, dither} → Blob */
M.encodeGIF = function(frames, opts={}){
  const w = frames[0].canvas.width, h = frames[0].canvas.height;
  const bytes = [];
  const push = (...a) => { for (const x of a) bytes.push(x); };
  const u16 = v => push(v & 255, v >> 8 & 255);
  push(...[...'GIF89a'].map(c => c.charCodeAt(0))); u16(w); u16(h); push(0xF7, 0, 0);
  for (const c of PAL) push(c[0], c[1], c[2]);
  push(0x21, 0xFF, 11, ...[...'NETSCAPE2.0'].map(c => c.charCodeAt(0)), 3, 1); u16(opts.loop ?? 0); push(0);
  for (const f of frames){
    const ctx = f.canvas.getContext('2d'); const data = ctx.getImageData(0, 0, w, h).data;
    const idx = quantize(data, w, h, opts.dither !== false);
    push(0x21, 0xF9, 4, 0x04); u16(Math.round((f.delay || 500) / 10)); push(0, 0);
    push(0x2C); u16(0); u16(0); u16(w); u16(h); push(0);
    push(8);
    const comp = lzw(idx, 8);
    for (let i = 0; i < comp.length; i += 255){ const n = Math.min(255, comp.length - i); push(n); for (let j = 0; j < n; j++) bytes.push(comp[i+j]); }
    push(0);
  }
  push(0x3B);
  return new Blob([new Uint8Array(bytes)], {type:'image/gif'});
};

/* ---------------- 픽셀 연산 ---------------- */
M.convolve = function(cv, kernel, mix=1){
  const ctx = cv.getContext('2d'), w = cv.width, h = cv.height;
  const src = ctx.getImageData(0, 0, w, h), s = src.data, out = ctx.createImageData(w, h), d = out.data;
  const k = kernel, ks = Math.sqrt(k.length) | 0, half = ks >> 1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++){
    let r = 0, g = 0, b = 0;
    for (let ky = 0; ky < ks; ky++) for (let kx = 0; kx < ks; kx++){
      const xx = Math.min(w-1, Math.max(0, x + kx - half)), yy = Math.min(h-1, Math.max(0, y + ky - half)), o = (yy * w + xx) * 4, kv = k[ky * ks + kx];
      r += s[o] * kv; g += s[o+1] * kv; b += s[o+2] * kv;
    }
    const o = (y * w + x) * 4;
    d[o] = s[o] + (r - s[o]) * mix; d[o+1] = s[o+1] + (g - s[o+1]) * mix; d[o+2] = s[o+2] + (b - s[o+2]) * mix; d[o+3] = s[o+3];
  }
  ctx.putImageData(out, 0, 0);
};
M.sharpen = (cv, amt=1) => M.convolve(cv, [0,-1,0,-1,5,-1,0,-1,0], amt);
M.autoLevel = function(cv){
  const ctx = cv.getContext('2d'), img = ctx.getImageData(0, 0, cv.width, cv.height), d = img.data;
  const lo = [255,255,255], hi = [0,0,0], hist = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
  for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 3; c++) hist[c][d[i+c]]++;
  const n = d.length / 4, cut = n * 0.005;
  for (let c = 0; c < 3; c++){ let a = 0; for (let v = 0; v < 256; v++){ a += hist[c][v]; if (a > cut){ lo[c] = v; break; } } a = 0; for (let v = 255; v >= 0; v--){ a += hist[c][v]; if (a > cut){ hi[c] = v; break; } } }
  const lut = [0,1,2].map(c => { const t = new Uint8ClampedArray(256); const span = Math.max(1, hi[c] - lo[c]); for (let v = 0; v < 256; v++) t[v] = (v - lo[c]) * 255 / span; return t; });
  for (let i = 0; i < d.length; i += 4){ d[i] = lut[0][d[i]]; d[i+1] = lut[1][d[i+1]]; d[i+2] = lut[2][d[i+2]]; }
  ctx.putImageData(img, 0, 0);
};
M.pixelate = function(cv, x, y, w, h, size){
  const ctx = cv.getContext('2d');
  x = Math.max(0, Math.round(x)); y = Math.max(0, Math.round(y)); w = Math.min(cv.width - x, Math.round(w)); h = Math.min(cv.height - y, Math.round(h));
  if (w < 1 || h < 1) return;
  const img = ctx.getImageData(x, y, w, h), d = img.data;
  for (let by = 0; by < h; by += size) for (let bx = 0; bx < w; bx += size){
    let r = 0, g = 0, b = 0, a = 0, n = 0;
    for (let yy = by; yy < Math.min(h, by + size); yy++) for (let xx = bx; xx < Math.min(w, bx + size); xx++){ const o = (yy * w + xx) * 4; r += d[o]; g += d[o+1]; b += d[o+2]; a += d[o+3]; n++; }
    r /= n; g /= n; b /= n; a /= n;
    for (let yy = by; yy < Math.min(h, by + size); yy++) for (let xx = bx; xx < Math.min(w, bx + size); xx++){ const o = (yy * w + xx) * 4; d[o] = r; d[o+1] = g; d[o+2] = b; d[o+3] = a; }
  }
  ctx.putImageData(img, x, y);
};
M.blurRegion = function(cv, x, y, w, h, radius){
  const ctx = cv.getContext('2d');
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); ctx.filter = `blur(${radius}px)`; ctx.drawImage(cv, 0, 0); ctx.restore();
};
M.histogram = function(cv){
  const ctx = cv.getContext('2d'), d = ctx.getImageData(0, 0, cv.width, cv.height).data;
  const h = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
  for (let i = 0; i < d.length; i += 4){ h[0][d[i]]++; h[1][d[i+1]]++; h[2][d[i+2]]++; h[3][(d[i]*0.299 + d[i+1]*0.587 + d[i+2]*0.114) | 0]++; }
  return h;
};
M.cloneCanvas = function(cv){ const c = document.createElement('canvas'); c.width = cv.width; c.height = cv.height; c.getContext('2d').drawImage(cv, 0, 0); return c; };
M.canvasFrom = function(img, w, h){ const c = document.createElement('canvas'); c.width = w || img.naturalWidth || img.width; c.height = h || img.naturalHeight || img.height; c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); return c; };
/* 고품질 축소 (단계적 절반 축소) */
M.resizeCanvas = function(cv, w, h){
  w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
  let cur = cv;
  while (cur.width / 2 >= w && cur.height / 2 >= h){ const t = document.createElement('canvas'); t.width = Math.round(cur.width / 2); t.height = Math.round(cur.height / 2); const c = t.getContext('2d'); c.imageSmoothingQuality = 'high'; c.drawImage(cur, 0, 0, t.width, t.height); cur = t; }
  const out = document.createElement('canvas'); out.width = w; out.height = h; const c = out.getContext('2d'); c.imageSmoothingQuality = 'high'; c.drawImage(cur, 0, 0, w, h);
  return out;
};
M.rotateCanvas = function(cv, deg){
  const r = deg * Math.PI / 180, s = Math.abs(Math.sin(r)), c = Math.abs(Math.cos(r));
  const w = Math.round(cv.width * c + cv.height * s), h = Math.round(cv.width * s + cv.height * c);
  const out = document.createElement('canvas'); out.width = w; out.height = h; const g = out.getContext('2d');
  g.translate(w/2, h/2); g.rotate(r); g.drawImage(cv, -cv.width/2, -cv.height/2);
  return out;
};
M.flipCanvas = function(cv, horiz){ const out = document.createElement('canvas'); out.width = cv.width; out.height = cv.height; const g = out.getContext('2d'); if (horiz){ g.translate(cv.width, 0); g.scale(-1, 1); } else { g.translate(0, cv.height); g.scale(1, -1); } g.drawImage(cv, 0, 0); return out; };

window.MoaImg = M;
})();
