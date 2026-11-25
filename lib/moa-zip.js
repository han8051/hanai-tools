/* HANAI Zip 압축 엔진: ZIP(저장/Deflate, ZIP64 읽기, ZipCrypto·AES-256 암호) / TAR / TAR.GZ / GZ
   의존: pako (deflate/inflate), Moa.crc32 */
(function(){
const Z = {};
const te = new TextEncoder();
const CRC_T = Moa.CRC_TABLE;

/* ---------------- 인코딩 ---------------- */
let cp949Map = null;
function buildCP949(){
  if (cp949Map) return cp949Map;
  cp949Map = new Map();
  const dec = new TextDecoder('euc-kr');
  for (let lead = 0x81; lead <= 0xFE; lead++){
    const bytes = []; const trails = [];
    for (let t = 0x41; t <= 0xFE; t++){ if (t > 0x5A && t < 0x61 || t > 0x7A && t < 0x81) continue; bytes.push(lead, t, 0x0A); trails.push(t); }
    const s = dec.decode(new Uint8Array(bytes)).split('\n');
    trails.forEach((t, i) => { const ch = s[i]; if (ch && ch.length === 1 && ch !== '�' && !cp949Map.has(ch)) cp949Map.set(ch, [lead, t]); });
  }
  return cp949Map;
}
Z.encodeName = function(str, enc){
  if (enc !== 'cp949') return te.encode(str);
  const m = buildCP949(); const out = [];
  for (const ch of str){ const c = ch.codePointAt(0); if (c < 0x80) out.push(c); else { const b = m.get(ch); if (b) out.push(b[0], b[1]); else out.push(0x3F); } }
  return new Uint8Array(out);
};
Z.canCP949 = str => { const m = buildCP949(); for (const ch of str) if (ch.codePointAt(0) >= 0x80 && !m.has(ch)) return false; return true; };
Z.decodeName = function(bytes, utf8Flag, enc){
  if (enc && enc !== 'auto'){ try { return new TextDecoder(enc).decode(bytes); } catch(e){} }
  if (utf8Flag) return new TextDecoder('utf-8').decode(bytes);
  let ascii = true; for (const b of bytes) if (b > 0x7f){ ascii = false; break; }
  if (ascii) return new TextDecoder('latin1').decode(bytes);
  try { return new TextDecoder('utf-8', {fatal:true}).decode(bytes); } catch(e){}
  try { return new TextDecoder('euc-kr').decode(bytes); } catch(e){}
  return new TextDecoder('latin1').decode(bytes);
};

/* ---------------- 날짜 ---------------- */
function dosToDate(time, date){ return new Date(((date >> 9) & 0x7f) + 1980, ((date >> 5) & 0x0f) - 1, date & 0x1f, (time >> 11) & 0x1f, (time >> 5) & 0x3f, (time & 0x1f) * 2); }
function dateToDos(d){ d = new Date(d || Date.now()); if (d.getFullYear() < 1980) d = new Date(1980,0,1); return {time:(d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date:((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()}; }

/* ---------------- CRC ---------------- */
function crc32Stream(){ let c = 0xFFFFFFFF; return { update(d){ for (let i = 0; i < d.length; i++) c = CRC_T[(c ^ d[i]) & 0xFF] ^ (c >>> 8); }, get value(){ return (c ^ 0xFFFFFFFF) >>> 0; } }; }

/* ---------------- ZipCrypto ---------------- */
function zcKeys(pw){
  const k = new Uint32Array([0x12345678, 0x23456789, 0x34567890]);
  const upd = c => { k[0] = CRC_T[(k[0] ^ c) & 0xFF] ^ (k[0] >>> 8); k[1] = (Math.imul((k[1] + (k[0] & 0xFF)) >>> 0, 134775813) + 1) >>> 0; k[2] = CRC_T[(k[2] ^ (k[1] >>> 24)) & 0xFF] ^ (k[2] >>> 8); };
  const ks = () => { const t = (k[2] | 2) & 0xFFFF; return (Math.imul(t, t ^ 1) >>> 8) & 0xFF; };
  for (const b of pw) upd(b);
  return {
    decrypt(d){ const o = new Uint8Array(d.length); for (let i = 0; i < d.length; i++){ const p = d[i] ^ ks(); o[i] = p; upd(p); } return o; },
    encrypt(d){ const o = new Uint8Array(d.length); for (let i = 0; i < d.length; i++){ const p = d[i]; o[i] = p ^ ks(); upd(p); } return o; }
  };
}

/* ---------------- AES (암호화 방향만, CTR용) ---------------- */
const SBOX = new Uint8Array(256), T0 = new Uint32Array(256), T1 = new Uint32Array(256), T2 = new Uint32Array(256), T3 = new Uint32Array(256);
(function(){
  const rotl8 = (x, s) => ((x << s) | (x >>> (8 - s))) & 0xFF;
  let p = 1, q = 1;
  do {
    p = p ^ ((p << 1) & 0xFF) ^ (p & 0x80 ? 0x1B : 0);
    q ^= q << 1; q ^= q << 2; q ^= q << 4; q &= 0xFF; if (q & 0x80) q ^= 0x09;
    SBOX[p] = (q ^ rotl8(q,1) ^ rotl8(q,2) ^ rotl8(q,3) ^ rotl8(q,4) ^ 0x63) & 0xFF;
  } while (p !== 1);
  SBOX[0] = 0x63;
  for (let i = 0; i < 256; i++){
    const s = SBOX[i], s2 = ((s << 1) ^ (s & 0x80 ? 0x1B : 0)) & 0xFF, s3 = s2 ^ s;
    const t = ((s2 << 24) | (s << 16) | (s << 8) | s3) >>> 0;
    T0[i] = t; T1[i] = ((t >>> 8) | (t << 24)) >>> 0; T2[i] = ((t >>> 16) | (t << 16)) >>> 0; T3[i] = ((t >>> 24) | (t << 8)) >>> 0;
  }
})();
function aesExpand(key){
  const nk = key.length / 4, nr = nk + 6, w = new Uint32Array(4 * (nr + 1));
  for (let i = 0; i < nk; i++) w[i] = (key[4*i] << 24 | key[4*i+1] << 16 | key[4*i+2] << 8 | key[4*i+3]) >>> 0;
  let rcon = 1;
  for (let i = nk; i < w.length; i++){
    let t = w[i-1];
    if (i % nk === 0){ t = ((SBOX[(t >>> 16) & 255] << 24) | (SBOX[(t >>> 8) & 255] << 16) | (SBOX[t & 255] << 8) | SBOX[t >>> 24]) ^ (rcon << 24); rcon = ((rcon << 1) ^ (rcon & 0x80 ? 0x1B : 0)) & 0xFF; }
    else if (nk > 6 && i % nk === 4) t = (SBOX[t >>> 24] << 24) | (SBOX[(t >>> 16) & 255] << 16) | (SBOX[(t >>> 8) & 255] << 8) | SBOX[t & 255];
    w[i] = (w[i-nk] ^ t) >>> 0;
  }
  return {w, nr};
}
function aesBlock(ks, inp, out){
  const {w, nr} = ks;
  let s0 = (inp[0] << 24 | inp[1] << 16 | inp[2] << 8 | inp[3]) ^ w[0], s1 = (inp[4] << 24 | inp[5] << 16 | inp[6] << 8 | inp[7]) ^ w[1];
  let s2 = (inp[8] << 24 | inp[9] << 16 | inp[10] << 8 | inp[11]) ^ w[2], s3 = (inp[12] << 24 | inp[13] << 16 | inp[14] << 8 | inp[15]) ^ w[3];
  let k = 4;
  for (let r = 1; r < nr; r++){
    const t0 = T0[s0 >>> 24] ^ T1[(s1 >>> 16) & 255] ^ T2[(s2 >>> 8) & 255] ^ T3[s3 & 255] ^ w[k++];
    const t1 = T0[s1 >>> 24] ^ T1[(s2 >>> 16) & 255] ^ T2[(s3 >>> 8) & 255] ^ T3[s0 & 255] ^ w[k++];
    const t2 = T0[s2 >>> 24] ^ T1[(s3 >>> 16) & 255] ^ T2[(s0 >>> 8) & 255] ^ T3[s1 & 255] ^ w[k++];
    const t3 = T0[s3 >>> 24] ^ T1[(s0 >>> 16) & 255] ^ T2[(s1 >>> 8) & 255] ^ T3[s2 & 255] ^ w[k++];
    s0 = t0; s1 = t1; s2 = t2; s3 = t3;
  }
  const f = (a, b, c, d, kk) => ((SBOX[a >>> 24] << 24) | (SBOX[(b >>> 16) & 255] << 16) | (SBOX[(c >>> 8) & 255] << 8) | SBOX[d & 255]) ^ kk;
  const o0 = f(s0,s1,s2,s3,w[k]), o1 = f(s1,s2,s3,s0,w[k+1]), o2 = f(s2,s3,s0,s1,w[k+2]), o3 = f(s3,s0,s1,s2,w[k+3]);
  [o0,o1,o2,o3].forEach((v, i) => { out[4*i] = v >>> 24; out[4*i+1] = v >>> 16 & 255; out[4*i+2] = v >>> 8 & 255; out[4*i+3] = v & 255; });
}
Z._aesBlock = (key, inp) => { const o = new Uint8Array(16); aesBlock(aesExpand(key), inp, o); return o; };
/* WinZip AES: 리틀엔디언 카운터 CTR (암호화·복호화 동일) */
function aesCtrLE(key, data){
  const ks = aesExpand(key), out = new Uint8Array(data.length), ctr = new Uint8Array(16), blk = new Uint8Array(16);
  for (let off = 0; off < data.length; off += 16){
    for (let i = 0; i < 16; i++){ ctr[i] = (ctr[i] + 1) & 255; if (ctr[i] !== 0) break; }
    aesBlock(ks, ctr, blk);
    const n = Math.min(16, data.length - off);
    for (let i = 0; i < n; i++) out[off+i] = data[off+i] ^ blk[i];
  }
  return out;
}
async function aesDerive(pw, salt, strength){
  const keyLen = [0,16,24,32][strength];
  const base = await crypto.subtle.importKey('raw', pw, 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2', salt, iterations:1000, hash:'SHA-1'}, base, (keyLen*2 + 2) * 8));
  return {enc: bits.slice(0, keyLen), mac: bits.slice(keyLen, keyLen*2), pv: bits.slice(keyLen*2)};
}
async function hmacSha1(key, data){ const k = await crypto.subtle.importKey('raw', key, {name:'HMAC', hash:'SHA-1'}, false, ['sign']); return new Uint8Array(await crypto.subtle.sign('HMAC', k, data)); }

/* ---------------- 공통 바이트 도우미 ---------------- */
const rd16 = (b,o) => b[o] | b[o+1] << 8, rd32 = (b,o) => (b[o] | b[o+1] << 8 | b[o+2] << 16 | b[o+3] << 24) >>> 0;
const rd64 = (b,o) => rd32(b,o) + rd32(b,o+4) * 4294967296;
async function slice(file, a, b){ return new Uint8Array(await file.slice(a, b).arrayBuffer()); }

Z.PasswordError = class extends Error { constructor(m){ super(m); this.name = 'PasswordError'; } };

/* ================= ZIP 읽기 ================= */
Z.openZip = async function(file, nameEnc='auto'){
  const size = file.size;
  const tailLen = Math.min(size, 65557 + 22);
  const tail = await slice(file, size - tailLen, size);
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) if (tail[i] === 0x50 && tail[i+1] === 0x4b && tail[i+2] === 5 && tail[i+3] === 6){ eocd = i; break; }
  if (eocd < 0) throw new Error('ZIP 파일의 끝 정보(EOCD)를 찾을 수 없습니다. 손상되었거나 분할 압축의 일부일 수 있습니다.');
  let count = rd16(tail, eocd + 10), cdSize = rd32(tail, eocd + 12), cdOff = rd32(tail, eocd + 16);
  const cLen = rd16(tail, eocd + 20);
  const commentBytes = tail.slice(eocd + 22, eocd + 22 + cLen);
  const diskNo = rd16(tail, eocd + 4);
  let zip64 = false;
  // ZIP64
  const loc = eocd - 20;
  if (loc >= 0 && rd32(tail, loc) === 0x07064b50){
    const z64off = rd64(tail, loc + 8);
    const z = await slice(file, z64off, z64off + 56);
    if (rd32(z, 0) === 0x06064b50){ count = rd64(z, 32); cdSize = rd64(z, 40); cdOff = rd64(z, 48); zip64 = true; }
  }
  // 앞쪽에 다른 데이터(자동 압축 풀림 exe 등)가 있는 경우 보정
  const eocdAbs = size - tailLen + eocd;
  let shift = 0;
  if (!zip64 && cdOff + cdSize !== eocdAbs && eocdAbs - cdSize >= 0) shift = eocdAbs - cdSize - cdOff;
  const cd = await slice(file, cdOff + shift, cdOff + shift + cdSize);
  const entries = [];
  let p = 0;
  for (let n = 0; n < count && p + 46 <= cd.length; n++){
    if (rd32(cd, p) !== 0x02014b50) break;
    const e = {
      verMade: rd16(cd, p+4), flags: rd16(cd, p+8), method: rd16(cd, p+10), dosTime: rd16(cd, p+12), dosDate: rd16(cd, p+14),
      crc: rd32(cd, p+16), csize: rd32(cd, p+20), usize: rd32(cd, p+24), extAttr: rd32(cd, p+38), offset: rd32(cd, p+42)
    };
    const nl = rd16(cd, p+28), xl = rd16(cd, p+30), cl = rd16(cd, p+32);
    e.nameBytes = cd.slice(p+46, p+46+nl);
    e.extra = cd.slice(p+46+nl, p+46+nl+xl);
    e.comment = Z.decodeName(cd.subarray(p+46+nl+xl, p+46+nl+xl+cl), e.flags & 0x800);
    // extra 필드
    let q = 0;
    while (q + 4 <= e.extra.length){
      const id = rd16(e.extra, q), len = rd16(e.extra, q+2), d = e.extra.subarray(q+4, q+4+len);
      if (id === 0x0001){ let r = 0; if (e.usize === 0xFFFFFFFF){ e.usize = rd64(d, r); r += 8; } if (e.csize === 0xFFFFFFFF){ e.csize = rd64(d, r); r += 8; } if (e.offset === 0xFFFFFFFF){ e.offset = rd64(d, r); r += 8; } }
      else if (id === 0x7075 && d[0] === 1){ e.unicodeName = new TextDecoder().decode(d.subarray(5)); }
      else if (id === 0x9901){ e.aes = {version: rd16(d,0), strength: d[4], method: rd16(d,5)}; }
      else if (id === 0x5455 && (d[0] & 1)){ e.mtime = new Date(rd32(d,1) * 1000); }
      q += 4 + len;
    }
    e.offset += shift;
    e.name = e.unicodeName || Z.decodeName(e.nameBytes, e.flags & 0x800, nameEnc);
    e.name = e.name.replace(/\\/g, '/');
    e.isDir = e.name.endsWith('/') || ((e.verMade >> 8) === 0 && (e.extAttr & 0x10) !== 0 && e.usize === 0);
    e.encrypted = !!(e.flags & 1);
    e.mtime = e.mtime || dosToDate(e.dosTime, e.dosDate);
    e.realMethod = e.aes ? e.aes.method : e.method;
    entries.push(e);
    p += 46 + nl + xl + cl;
  }
  return {type:'zip', file, entries, comment: Z.decodeName(commentBytes, false, nameEnc), zip64, multiDisk: diskNo > 0, nameEnc};
};
Z.reDecodeNames = function(arc, enc){ arc.nameEnc = enc; arc.entries.forEach(e => { if (e.nameBytes && !e.unicodeName) e.name = Z.decodeName(e.nameBytes, e.flags & 0x800, enc).replace(/\\/g,'/'); }); };

/* 압축 데이터 원본(로컬 헤더 이후) 읽기 */
Z.readRaw = async function(arc, e){
  const h = await slice(arc.file, e.offset, e.offset + 30);
  if (rd32(h, 0) !== 0x04034b50) throw new Error('로컬 헤더가 손상되었습니다: ' + e.name);
  const start = e.offset + 30 + rd16(h, 26) + rd16(h, 28);
  return slice(arc.file, start, start + e.csize);
};
Z.methodName = m => ({0:'저장', 8:'Deflate', 9:'Deflate64', 12:'BZip2', 14:'LZMA', 93:'Zstandard', 95:'XZ', 98:'PPMd', 99:'AES'}[m] || ('방식 ' + m));
/* 항목 압축 풀기 → Uint8Array */
Z.extractZip = async function(arc, e, password){
  if (e.isDir) return new Uint8Array(0);
  let data = await Z.readRaw(arc, e);
  if (e.encrypted){
    if (password == null) throw new Z.PasswordError('암호가 필요합니다');
    const pw = te.encode(password);
    if (e.aes){
      const saltLen = [0,8,12,16][e.aes.strength];
      const salt = data.subarray(0, saltLen), pv = data.subarray(saltLen, saltLen + 2);
      const k = await aesDerive(pw, salt, e.aes.strength);
      if (k.pv[0] !== pv[0] || k.pv[1] !== pv[1]) throw new Z.PasswordError('암호가 맞지 않습니다');
      const enc = data.subarray(saltLen + 2, data.length - 10), mac = data.subarray(data.length - 10);
      const calc = await hmacSha1(k.mac, enc);
      for (let i = 0; i < 10; i++) if (calc[i] !== mac[i]) throw new Error('데이터 인증(HMAC)에 실패했습니다. 파일이 손상되었습니다: ' + e.name);
      data = aesCtrLE(k.enc, enc);
    } else {
      const dec = zcKeys(pw).decrypt(data);
      const check = (e.flags & 8) ? (e.dosTime >> 8) & 0xFF : e.crc >>> 24;
      if (dec[11] !== check) throw new Z.PasswordError('암호가 맞지 않습니다');
      data = dec.subarray(12);
    }
  }
  const m = e.realMethod;
  let out;
  if (m === 0) out = data;
  else if (m === 8){ try { out = pako.inflateRaw(data); } catch(err){ throw new Error('압축 해제 실패(손상된 데이터): ' + e.name); } }
  else throw new Error(`'${Z.methodName(m)}' 압축 방식은 지원하지 않습니다: ` + e.name);
  if (!(e.aes && e.aes.version === 2)){
    const c = Moa.crc32(out);
    if (c !== e.crc) throw new Error('CRC 오류 (파일이 손상되었거나 암호가 틀렸습니다): ' + e.name);
  }
  return out;
};

/* ================= ZIP 쓰기 =================
   items: [{name, isDir, mtime, data:Uint8Array|Blob|File, raw:{entry, arc}}]
   opts: {level 0-9, password, encryption:'aes'|'zipcrypto', nameEnc:'utf8'|'cp949', comment, onProgress(i,n,name)} */
Z.writeZip = async function(items, opts={}){
  const parts = [], central = []; let offset = 0;
  const level = opts.level ?? 6;
  const pw = opts.password ? te.encode(opts.password) : null;
  const useAes = pw && opts.encryption !== 'zipcrypto';
  const push = b => { parts.push(b); offset += b.size ?? b.length; };
  for (let i = 0; i < items.length; i++){
    const it = items[i];
    opts.onProgress && await opts.onProgress(i, items.length, it.name);
    let name = it.name.replace(/\\/g, '/'); if (it.isDir && !name.endsWith('/')) name += '/';
    const nameBytes = Z.encodeName(name, opts.nameEnc);
    const utf8 = opts.nameEnc !== 'cp949' && /[^\x00-\x7f]/.test(name);
    const dt = dateToDos(it.mtime);
    let flags = utf8 ? 0x800 : 0, method = 0, crc = 0, usize = 0, body = new Uint8Array(0), extra = new Uint8Array(0);
    // 압축 데이터 그대로 복사 (변경 없는 항목, 암호 설정이 같을 때)
    if (it.raw && !it.isDir){
      const e = it.raw.entry;
      body = await Z.readRaw(it.raw.arc, e);
      method = e.method; crc = e.crc; usize = e.usize; flags = (e.flags & ~0x808) | (utf8 ? 0x800 : 0);
      if (e.aes){ extra = aesExtra(e.aes.strength, e.aes.method, e.aes.version); }
      if (flags & 1 && !e.aes && (e.flags & 8)){ /* 데이터 설명자 기반 ZipCrypto는 시간 바이트로 검증 → 시간 유지 */ dt.time = e.dosTime; dt.date = e.dosDate; }
    } else if (!it.isDir){
      let data = it.data instanceof Uint8Array ? it.data : new Uint8Array(await it.data.arrayBuffer());
      usize = data.length; crc = Moa.crc32(data);
      let comp = data; method = 0;
      if (level > 0 && data.length > 0){ const d = pako.deflateRaw(data, {level}); if (d.length < data.length){ comp = d; method = 8; } }
      if (pw){
        flags |= 1;
        if (useAes){
          const salt = crypto.getRandomValues(new Uint8Array(16));
          const k = await aesDerive(pw, salt, 3);
          const enc = aesCtrLE(k.enc, comp);
          const mac = (await hmacSha1(k.mac, enc)).subarray(0, 10);
          body = new Uint8Array(16 + 2 + enc.length + 10); body.set(salt); body.set(k.pv, 16); body.set(enc, 18); body.set(mac, 18 + enc.length);
          extra = aesExtra(3, method, 1); method = 99;
        } else {
          const hdr = crypto.getRandomValues(new Uint8Array(12)); hdr[11] = crc >>> 24;
          const z = zcKeys(pw); const eh = z.encrypt(hdr), ed = z.encrypt(comp);
          body = new Uint8Array(12 + ed.length); body.set(eh); body.set(ed, 12);
        }
      } else body = comp;
    }
    if (offset > 0xFFFFFFFF || body.length > 0xFFFFFFFF) throw new Error('4GB가 넘는 ZIP은 아직 만들 수 없습니다.');
    const lh = new Uint8Array(30), dv = new DataView(lh.buffer);
    dv.setUint32(0, 0x04034b50, true); dv.setUint16(4, method === 99 ? 51 : 20, true); dv.setUint16(6, flags, true); dv.setUint16(8, method, true);
    dv.setUint16(10, dt.time, true); dv.setUint16(12, dt.date, true); dv.setUint32(14, crc, true); dv.setUint32(18, body.length, true); dv.setUint32(22, usize, true);
    dv.setUint16(26, nameBytes.length, true); dv.setUint16(28, extra.length, true);
    const localOff = offset;
    push(lh); push(nameBytes); if (extra.length) push(extra); if (body.length) push(body);
    const ch = new Uint8Array(46), cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, (3 << 8) | 63, true); cv.setUint16(6, method === 99 ? 51 : 20, true); cv.setUint16(8, flags, true); cv.setUint16(10, method, true);
    cv.setUint16(12, dt.time, true); cv.setUint16(14, dt.date, true); cv.setUint32(16, crc, true); cv.setUint32(20, body.length, true); cv.setUint32(24, usize, true);
    cv.setUint16(28, nameBytes.length, true); cv.setUint16(30, extra.length, true); cv.setUint16(32, 0, true);
    cv.setUint32(38, it.isDir ? ((0o40755 << 16) | 0x10) >>> 0 : ((0o100644 << 16) | 0x20) >>> 0, true); cv.setUint32(42, localOff, true);
    central.push(ch, nameBytes, extra);
  }
  const cdStart = offset; let cdSize = 0;
  for (const c of central){ push(c); cdSize += c.length; }
  const cm = opts.comment ? Z.encodeName(opts.comment, opts.nameEnc) : new Uint8Array(0);
  const ed = new Uint8Array(22), ev = new DataView(ed.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, items.length, true); ev.setUint16(10, items.length, true); ev.setUint32(12, cdSize, true); ev.setUint32(16, cdStart, true); ev.setUint16(20, cm.length, true);
  push(ed); if (cm.length) push(cm);
  opts.onProgress && await opts.onProgress(items.length, items.length, '');
  return new Blob(parts, {type:'application/zip'});
};
function aesExtra(strength, method, version){ const x = new Uint8Array(11), v = new DataView(x.buffer); v.setUint16(0, 0x9901, true); v.setUint16(2, 7, true); v.setUint16(4, version, true); x[6] = 0x41; x[7] = 0x45; x[8] = strength; v.setUint16(9, method, true); return x; }

/* ================= TAR ================= */
function tarStr(b, o, n){ let e = o; while (e < o + n && b[e]) e++; return Z.decodeName(b.subarray(o, e), false); }
function tarOct(b, o, n){ if (b[o] & 0x80){ let v = 0; for (let i = o + 1; i < o + n; i++) v = v * 256 + b[i]; return v; } const s = tarStr(b, o, n).trim(); return s ? parseInt(s, 8) : 0; }
Z.openTar = function(buf, file, type='tar'){
  const entries = []; let p = 0, longName = null, pax = {};
  while (p + 512 <= buf.length){
    const h = buf.subarray(p, p + 512);
    if (h.every(x => x === 0)) break;
    let name = tarStr(h, 0, 100); const size = tarOct(h, 124, 12), mtime = tarOct(h, 136, 12), tf = String.fromCharCode(h[156] || 48);
    const magic = tarStr(h, 257, 6); if (magic.startsWith('ustar')){ const pre = tarStr(h, 345, 155); if (pre) name = pre + '/' + name; }
    const dataStart = p + 512; p = dataStart + Math.ceil(size / 512) * 512;
    if (tf === 'L'){ longName = tarStr(buf, dataStart, size); continue; }
    if (tf === 'x' || tf === 'g'){ const t = new TextDecoder().decode(buf.subarray(dataStart, dataStart + size)); let q = 0; while (q < t.length){ const sp = t.indexOf(' ', q); const len = parseInt(t.slice(q, sp)); const kv = t.slice(sp + 1, q + len - 1); const eq = kv.indexOf('='); if (tf === 'x') pax[kv.slice(0, eq)] = kv.slice(eq + 1); q += len; if (!len) break; } continue; }
    if (longName){ name = longName; longName = null; }
    if (pax.path){ name = pax.path; }
    const psize = pax.size ? +pax.size : size;
    pax = {};
    if (tf === '1' || tf === '2'){ continue; }
    const isDir = tf === '5' || name.endsWith('/');
    entries.push({name, isDir, usize: isDir ? 0 : psize, csize: isDir ? 0 : psize, mtime: new Date(mtime * 1000), offset: dataStart, method: 0, realMethod: 0, crc: null, tar: true});
  }
  return {type, file, buf, entries, comment:''};
};
Z.extractTar = (arc, e) => arc.buf.slice(e.offset, e.offset + e.usize);
Z.writeTar = async function(items, opts={}){
  const parts = [];
  const header = (name, size, mtime, tf) => {
    const h = new Uint8Array(512);
    const put = (s, o, n) => { const b = te.encode(s); h.set(b.subarray(0, n), o); };
    const oct = (v, o, n) => put(v.toString(8).padStart(n - 1, '0'), o, n - 1);
    put(name, 0, 100); oct(tf === '5' ? 0o755 : 0o644, 100, 8); oct(0, 108, 8); oct(0, 116, 8); oct(size, 124, 12); oct(Math.floor((mtime ? +new Date(mtime) : Date.now()) / 1000), 136, 12);
    h.fill(32, 148, 156); h[156] = tf.charCodeAt(0); put('ustar', 257, 6); put('00', 263, 2);
    let sum = 0; for (const x of h) sum += x; put(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8);
    return h;
  };
  const pad = n => new Uint8Array((512 - n % 512) % 512);
  for (let i = 0; i < items.length; i++){
    const it = items[i]; opts.onProgress && await opts.onProgress(i, items.length, it.name);
    let name = it.name; if (it.isDir && !name.endsWith('/')) name += '/';
    const data = it.isDir ? new Uint8Array(0) : (it.data instanceof Uint8Array ? it.data : new Uint8Array(await it.data.arrayBuffer()));
    if (te.encode(name).length > 99){ const rec = ' path=' + name + '\n'; let len = te.encode(rec).length; len += String(len + String(len).length).length; const paxData = te.encode(len + rec); parts.push(header('PaxHeader/' + name.slice(-80).replace(/[^\x20-\x7e]/g,'_'), paxData.length, it.mtime, 'x'), paxData, pad(paxData.length)); }
    parts.push(header(name, data.length, it.mtime, it.isDir ? '5' : '0'));
    if (data.length){ parts.push(data, pad(data.length)); }
  }
  parts.push(new Uint8Array(1024));
  opts.onProgress && await opts.onProgress(items.length, items.length, '');
  return new Blob(parts, {type:'application/x-tar'});
};

/* ================= 열기 (형식 자동 판별) ================= */
Z.open = async function(file, nameEnc='auto'){
  const head = await slice(file, 0, 512);
  const lname = file.name.toLowerCase();
  if (head[0] === 0x50 && head[1] === 0x4b) return Z.openZip(file, nameEnc);
  if (head[0] === 0x1f && head[1] === 0x8b){
    const raw = pako.ungzip(new Uint8Array(await file.arrayBuffer()));
    if (raw.length >= 512 && String.fromCharCode(...raw.subarray(257, 262)) === 'ustar' || /\.(tgz|tar\.gz)$/.test(lname)) return Z.openTar(raw, file, 'tgz');
    // 단일 gzip
    let name = file.name.replace(/\.gz$/i, '') || 'data';
    if (head[3] & 8){ let e = 10 + (head[3] & 4 ? 2 + rd16(head, 10) : 0); let s = e; while (head[e]) e++; name = new TextDecoder('latin1').decode(head.subarray(s, e)) || name; }
    return {type:'gz', file, buf:raw, comment:'', entries:[{name, isDir:false, usize:raw.length, csize:file.size, mtime:new Date(rd32(head,4)*1000 || file.lastModified), offset:0, method:8, realMethod:8, crc:null, tar:true}]};
  }
  if (String.fromCharCode(...head.subarray(257, 262)) === 'ustar' || /\.tar$/.test(lname)) return Z.openTar(new Uint8Array(await file.arrayBuffer()), file, 'tar');
  // 자동 압축 풀림(SFX) 또는 앞에 데이터가 붙은 ZIP
  try { return await Z.openZip(file, nameEnc); } catch(e){}
  const sig = Array.from(head.subarray(0, 8)).map(b => b.toString(16).padStart(2,'0')).join(' ');
  const known = head[0]===0x52&&head[1]===0x61&&head[2]===0x72 ? 'RAR' : head[0]===0x37&&head[1]===0x7a ? '7Z' : head[0]===0x41&&head[1]===0x4c&&head[2]===0x5a ? 'ALZ' : head[0]===0x45&&head[1]===0x47&&head[2]===0x47&&head[3]===0x41 ? 'EGG' : head[0]===0x42&&head[1]===0x5a&&head[2]===0x68 ? 'BZ2' : head[0]===0xfd&&head[1]===0x37 ? 'XZ' : null;
  throw new Error(known ? `${known} 형식은 브라우저에서 풀 수 없습니다. ZIP, TAR, TAR.GZ(TGZ), GZ 형식을 지원합니다.` : '지원하지 않거나 압축 파일이 아닙니다. (시그니처: ' + sig + ')');
};
Z.extract = (arc, e, pw) => arc.type === 'zip' ? Z.extractZip(arc, e, pw) : Promise.resolve(Z.extractTar(arc, e));

window.MoaZip = Z;
})();
