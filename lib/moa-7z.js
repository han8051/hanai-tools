/* HANAI 7Z 엔진: 7z 압축 풀기 (Copy, LZMA, LZMA2, Deflate, BZip2, BCJ x86/ARM/ARMT/PPC/SPARC, Delta, AES-256)
   의존: pako(inflateRaw), Moa.crc32, MoaZip (등록) */
(function(){
const S7 = {};

/* ===================== LZMA ===================== */
const kNumStates = 12, kEndPosModelIndex = 14, kNumFullDistances = 128, kNumAlignBits = 4, kMatchMinLen = 2;
function initProbs(n){ const a = new Uint16Array(n); a.fill(1024); return a; }
class RangeDecoder {
  constructor(buf, pos){
    this.b = buf; this.p = pos + 1; this.range = 0xFFFFFFFF; this.code = 0;
    for (let i = 0; i < 4; i++) this.code = ((this.code << 8) | buf[this.p++]) >>> 0;
  }
  bit(probs, i){
    const pr = probs[i], bound = (this.range >>> 11) * pr;
    let r;
    if (this.code < bound){ this.range = bound; probs[i] = pr + ((2048 - pr) >>> 5); r = 0; }
    else { this.range = (this.range - bound) >>> 0; this.code = (this.code - bound) >>> 0; probs[i] = pr - (pr >>> 5); r = 1; }
    if (this.range < 0x1000000){ this.range = (this.range << 8) >>> 0; this.code = ((this.code << 8) | this.b[this.p++]) >>> 0; }
    return r;
  }
  direct(n){
    let res = 0;
    for (; n > 0; n--){
      this.range >>>= 1;
      let bit = 0;
      if (this.code >= this.range){ this.code = (this.code - this.range) >>> 0; bit = 1; }
      res = ((res << 1) | bit) >>> 0;
      if (this.range < 0x1000000){ this.range = (this.range << 8) >>> 0; this.code = ((this.code << 8) | this.b[this.p++]) >>> 0; }
    }
    return res;
  }
  tree(probs, off, n){ let m = 1; for (let i = 0; i < n; i++) m = (m << 1) + this.bit(probs, off + m); return m - (1 << n); }
  rtree(probs, off, n){ let m = 1, s = 0; for (let i = 0; i < n; i++){ const b = this.bit(probs, off + m); m = (m << 1) + b; s |= b << i; } return s; }
}
class LenDecoder {
  constructor(){ this.choice = initProbs(2); this.low = initProbs(16 << 3); this.mid = initProbs(16 << 3); this.high = initProbs(256); }
  decode(rc, posState){
    if (!rc.bit(this.choice, 0)) return rc.tree(this.low, posState << 3, 3);
    if (!rc.bit(this.choice, 1)) return 8 + rc.tree(this.mid, posState << 3, 3);
    return 16 + rc.tree(this.high, 0, 8);
  }
}
class LzmaDecoder {
  constructor(out){ this.out = out; this.pos = 0; this.base = 0; this.setProps(3, 0, 2); this.resetState(); }
  setProps(lc, lp, pb){ if (lc > 8 || lp > 4 || pb > 4) throw new Error('LZMA 설정 오류'); this.lc = lc; this.lp = lp; this.pb = pb; }
  resetState(){
    this.literal = initProbs(0x300 << (this.lc + this.lp));
    this.isMatch = initProbs(kNumStates << 4); this.isRep = initProbs(kNumStates); this.isRepG0 = initProbs(kNumStates);
    this.isRepG1 = initProbs(kNumStates); this.isRepG2 = initProbs(kNumStates); this.isRep0Long = initProbs(kNumStates << 4);
    this.posSlot = initProbs(4 << 6); this.posDec = initProbs(1 + kNumFullDistances - kEndPosModelIndex); this.align = initProbs(1 << kNumAlignBits);
    this.lenDec = new LenDecoder(); this.repLenDec = new LenDecoder();
    this.state = 0; this.rep0 = this.rep1 = this.rep2 = this.rep3 = 0;
  }
  /* rc에서 outLimit까지 풀기. allowEnd: 끝 표시 허용 */
  decode(rc, outLimit, dictStart){
    const out = this.out, lc = this.lc, lpMask = (1 << this.lp) - 1, pbMask = (1 << this.pb) - 1;
    const baseP = this.base; let pos = this.pos, state = this.state, rep0 = this.rep0, rep1 = this.rep1, rep2 = this.rep2, rep3 = this.rep3;
    const lit = this.literal, isMatch = this.isMatch;
    while (pos < outLimit){
      const posState = (pos - baseP) & pbMask;
      if (!rc.bit(isMatch, (state << 4) + posState)){
        const prev = pos > dictStart ? out[pos - 1] : 0;
        const base = 0x300 * ((((pos - baseP) & lpMask) << lc) + (prev >> (8 - lc)));
        let sym = 1;
        if (state >= 7){
          let mb = out[pos - rep0 - 1];
          do {
            const matchBit = (mb >> 7) & 1; mb <<= 1;
            const b = rc.bit(lit, base + ((1 + matchBit) << 8) + sym);
            sym = (sym << 1) | b;
            if (matchBit !== b){ while (sym < 0x100) sym = (sym << 1) | rc.bit(lit, base + sym); break; }
          } while (sym < 0x100);
        } else { while (sym < 0x100) sym = (sym << 1) | rc.bit(lit, base + sym); }
        out[pos++] = sym & 0xFF;
        state = state < 4 ? 0 : state < 10 ? state - 3 : state - 6;
        continue;
      }
      let len;
      if (!rc.bit(this.isRep, state)){
        rep3 = rep2; rep2 = rep1; rep1 = rep0;
        len = this.lenDec.decode(rc, posState);
        state = state < 7 ? 7 : 10;
        // 거리
        const lenState = len < 3 ? len : 3;
        const slot = rc.tree(this.posSlot, lenState << 6, 6);
        if (slot < 4) rep0 = slot;
        else {
          const nd = (slot >>> 1) - 1;
          let dist = ((2 | (slot & 1)) << nd) >>> 0;
          if (slot < kEndPosModelIndex) dist = (dist + rc.rtree(this.posDec, dist - slot - 1, nd)) >>> 0;
          else { dist = (dist + (rc.direct(nd - kNumAlignBits) << kNumAlignBits)) >>> 0; dist = (dist + rc.rtree(this.align, 0, kNumAlignBits)) >>> 0; }
          rep0 = dist;
          if (rep0 === 0xFFFFFFFF){ this.pos = pos; this.ended = true; break; } // 끝 표시
        }
      } else {
        if (!rc.bit(this.isRepG0, state)){
          if (!rc.bit(this.isRep0Long, (state << 4) + posState)){
            state = state < 7 ? 9 : 11;
            out[pos] = out[pos - rep0 - 1]; pos++;
            continue;
          }
        } else {
          let dist;
          if (!rc.bit(this.isRepG1, state)) dist = rep1;
          else { if (!rc.bit(this.isRepG2, state)) dist = rep2; else { dist = rep3; rep3 = rep2; } rep2 = rep1; }
          rep1 = rep0; rep0 = dist;
        }
        len = this.repLenDec.decode(rc, posState);
        state = state < 7 ? 8 : 11;
      }
      len += kMatchMinLen;
      if (rep0 + 1 > pos - dictStart) throw new Error('LZMA 데이터 오류 (거리)');
      let src = pos - rep0 - 1;
      const end = Math.min(outLimit, pos + len);
      while (pos < end) out[pos++] = out[src++];
    }
    this.pos = pos; this.state = state; this.rep0 = rep0; this.rep1 = rep1; this.rep2 = rep2; this.rep3 = rep3;
  }
}
function lzmaProps(d){ let x = d; if (x >= 9 * 5 * 5) throw new Error('LZMA 속성 오류'); const lc = x % 9; x = (x / 9) | 0; return {lc, lp: x % 5, pb: (x / 5) | 0}; }
S7.lzma = function(input, props, outSize){
  const out = new Uint8Array(outSize);
  const p = lzmaProps(props[0]);
  const dec = new LzmaDecoder(out); dec.setProps(p.lc, p.lp, p.pb); dec.resetState();
  const rc = new RangeDecoder(input, 0);
  dec.decode(rc, outSize, 0);
  if (dec.pos !== outSize) throw new Error('LZMA 데이터가 짧습니다');
  return out;
};
S7.lzma2 = function(input, props, outSize){
  const out = new Uint8Array(outSize);
  const dec = new LzmaDecoder(out);
  let ip = 0, needProps = true, dictStart = 0;
  while (ip < input.length){
    const c = input[ip++];
    if (c === 0) break;
    if (c === 1 || c === 2){
      const size = ((input[ip] << 8) | input[ip + 1]) + 1; ip += 2;
      if (c === 1) dictStart = dec.pos;
      out.set(input.subarray(ip, ip + size), dec.pos); dec.pos += size; ip += size; continue;
    }
    if (c < 0x80) throw new Error('LZMA2 데이터 오류');
    const usize = ((c & 0x1F) << 16) + (input[ip] << 8) + input[ip + 1] + 1; ip += 2;
    const psize = ((input[ip] << 8) | input[ip + 1]) + 1; ip += 2;
    const mode = (c >> 5) & 3;
    if (mode === 3) dictStart = dec.pos;
    if (mode >= 2){ const pr = lzmaProps(input[ip++]); dec.setProps(pr.lc, pr.lp, pr.pb); needProps = false; }
    else if (needProps) throw new Error('LZMA2 속성이 없습니다');
    if (mode >= 1){ dec.resetState(); dec.base = dec.pos; }
    const rc = new RangeDecoder(input, ip);
    dec.decode(rc, dec.pos + usize, dictStart);
    ip += psize;
  }
  if (dec.pos !== outSize) throw new Error('LZMA2 크기가 맞지 않습니다');
  return out;
};

/* ===================== BZip2 ===================== */
S7.bzip2 = function(input, props, outSize){
  const out = new Uint8Array(outSize); let op = 0;
  let bp = 0; // 비트 위치
  const bit = () => { const v = (input[bp >>> 3] >> (7 - (bp & 7))) & 1; bp++; return v; };
  const bits = n => { let v = 0; for (let i = 0; i < n; i++) v = (v << 1) | bit(); return v >>> 0; };
  while (op < outSize){
    if (bits(8) !== 0x42 || bits(8) !== 0x5A || bits(8) !== 0x68) { if (op) break; throw new Error('BZip2 서명이 없습니다'); }
    const level = bits(8) - 0x30; const maxBlock = level * 100000;
    for (;;){
      const m1 = bits(24), m2 = bits(24);
      if (m1 === 0x177245 && m2 === 0x385090){ bits(32); bp = (bp + 7) & ~7; break; }
      if (m1 !== 0x314159 || m2 !== 0x265359) throw new Error('BZip2 블록 오류');
      bits(32); if (bit()) throw new Error('BZip2 무작위화 블록은 지원하지 않습니다');
      const origPtr = bits(24);
      const used = bits(16); const inUse = [];
      for (let i = 0; i < 16; i++) if (used & (0x8000 >> i)){ const w = bits(16); for (let j = 0; j < 16; j++) if (w & (0x8000 >> j)) inUse.push(i * 16 + j); }
      const alpha = inUse.length + 2;
      const nGroups = bits(3), nSel = bits(15);
      const mtfG = [0,1,2,3,4,5].slice(0, nGroups), sel = new Uint8Array(nSel);
      for (let i = 0; i < nSel; i++){ let j = 0; while (bit()) j++; const v = mtfG[j]; mtfG.splice(j, 1); mtfG.unshift(v); sel[i] = v; }
      const tables = [];
      for (let g = 0; g < nGroups; g++){
        const L = new Uint8Array(alpha); let len = bits(5);
        for (let s = 0; s < alpha; s++){ while (bit()) len += bit() ? -1 : 1; L[s] = len; }
        let minL = 32, maxL = 0; for (const l of L){ if (l < minL) minL = l; if (l > maxL) maxL = l; }
        const count = new Int32Array(maxL + 2), first = new Int32Array(maxL + 2), firstIdx = new Int32Array(maxL + 2), perm = new Int32Array(alpha);
        let pp = 0; for (let l = minL; l <= maxL; l++) for (let s = 0; s < alpha; s++) if (L[s] === l){ perm[pp++] = s; count[l]++; }
        let code = 0, idx = 0; for (let l = 1; l <= maxL; l++){ first[l] = code; firstIdx[l] = idx; code += count[l]; idx += count[l]; code <<= 1; }
        tables.push({count, first, firstIdx, perm, maxL});
      }
      const tt = new Uint8Array(maxBlock); let n = 0;
      const mtf = inUse.slice(); let gi = 0, left = 0, tb = null, runPos = 0, runLen = 0;
      const flushRun = () => { if (runLen){ const b = mtf[0]; if (n + runLen > maxBlock) throw new Error('BZip2 블록이 너무 큽니다'); tt.fill(b, n, n + runLen); n += runLen; runLen = 0; runPos = 0; } };
      for (;;){
        if (!left){ tb = tables[sel[gi++]]; left = 50; } left--;
        let code = 0, sym = -1;
        for (let l = 1; l <= tb.maxL; l++){ code = (code << 1) | bit(); const k = code - tb.first[l]; if (tb.count[l] && k >= 0 && k < tb.count[l]){ sym = tb.perm[tb.firstIdx[l] + k]; break; } }
        if (sym < 0) throw new Error('BZip2 허프만 오류');
        if (sym <= 1){ runLen += (sym + 1) << runPos; runPos++; continue; }
        flushRun();
        if (sym === alpha - 1) break;
        const k = sym - 1, b = mtf[k]; mtf.splice(k, 1); mtf.unshift(b);
        if (n >= maxBlock) throw new Error('BZip2 블록이 너무 큽니다'); tt[n++] = b;
      }
      // BWT 역변환
      const C = new Int32Array(256); for (let i = 0; i < n; i++) C[tt[i]]++;
      let sum = 0; for (let c = 0; c < 256; c++){ const t = C[c]; C[c] = sum; sum += t; }
      const T = new Int32Array(n); for (let i = 0; i < n; i++) T[C[tt[i]]++] = i;
      let p = T[origPtr], last = -1, rep = 0;
      for (let i = 0; i < n; i++){
        const b = tt[p]; p = T[p];
        if (rep === 4){ for (let k = 0; k < b; k++) out[op++] = last; rep = 0; last = -1; continue; }
        if (b === last) rep++; else { rep = 1; last = b; }
        out[op++] = b;
      }
    }
  }
  if (op !== outSize) throw new Error('BZip2 크기가 맞지 않습니다');
  return out;
};

/* ===================== 필터 ===================== */
function x86(data, ip){
  const ALLOWED = [1,1,1,0,1,0,0,0], BITNUM = [0,1,2,2,3,3,3,3];
  const size = data.length; if (size < 5) return data;
  ip = (ip + 5) >>> 0; let pos = 0, prevPos = -1, prevMask = 0;
  const test = b => b === 0 || b === 0xFF;
  for (;;){
    while (pos < size - 4 && (data[pos] & 0xFE) !== 0xE8) pos++;
    if (pos >= size - 4) break;
    let d = pos - prevPos;
    if (d > 3) prevMask = 0;
    else {
      prevMask = (prevMask << (d - 1)) & 7;
      if (prevMask !== 0){
        const b = data[pos + 4 - BITNUM[prevMask]];
        if (!ALLOWED[prevMask] || test(b)){ prevPos = pos; prevMask = ((prevMask << 1) & 7) | 1; pos++; continue; }
      }
    }
    prevPos = pos;
    if (test(data[pos + 4])){
      let src = ((data[pos + 4] << 24) | (data[pos + 3] << 16) | (data[pos + 2] << 8) | data[pos + 1]) >>> 0, dest;
      for (;;){
        dest = (src - ((ip + pos) >>> 0)) >>> 0;
        if (prevMask === 0) break;
        const idx = BITNUM[prevMask] * 8, b = (dest >>> (24 - idx)) & 0xFF;
        if (!test(b)) break;
        src = (dest ^ ((2 ** (32 - idx)) - 1)) >>> 0;
      }
      data[pos + 4] = ((dest >>> 24) & 1) ? 0xFF : 0; data[pos + 3] = (dest >>> 16) & 0xFF; data[pos + 2] = (dest >>> 8) & 0xFF; data[pos + 1] = dest & 0xFF;
      pos += 5;
    } else { prevMask = ((prevMask << 1) & 7) | 1; pos++; }
  }
  return data;
}
function arm(data){ for (let i = 0; i + 4 <= data.length; i += 4){ if (data[i + 3] === 0xEB){ const src = ((data[i + 2] << 16) | (data[i + 1] << 8) | data[i]) << 2; const dest = ((src - (i + 8)) >>> 2) & 0xFFFFFF; data[i + 2] = dest >> 16; data[i + 1] = (dest >> 8) & 0xFF; data[i] = dest & 0xFF; } } return data; }
function armt(data){ for (let i = 0; i + 4 <= data.length; i += 2){ if ((data[i + 1] & 0xF8) === 0xF0 && (data[i + 3] & 0xF8) === 0xF8){ const src = (((data[i + 1] & 7) << 19) | (data[i] << 11) | ((data[i + 3] & 7) << 8) | data[i + 2]) << 1; const dest = ((src - (i + 4)) >>> 1); data[i + 1] = 0xF0 | ((dest >>> 19) & 7); data[i] = (dest >>> 11) & 0xFF; data[i + 3] = 0xF8 | ((dest >>> 8) & 7); data[i + 2] = dest & 0xFF; i += 2; } } return data; }
function ppc(data){ for (let i = 0; i + 4 <= data.length; i += 4){ if ((data[i] >> 2) === 0x12 && (data[i + 3] & 3) === 1){ const src = ((data[i] & 3) << 24) | (data[i + 1] << 16) | (data[i + 2] << 8) | (data[i + 3] & ~3); const dest = (src - i) >>> 0; data[i] = 0x48 | ((dest >>> 24) & 3); data[i + 1] = (dest >>> 16) & 0xFF; data[i + 2] = (dest >>> 8) & 0xFF; data[i + 3] = (data[i + 3] & 3) | (dest & 0xFC); } } return data; }
function sparc(data){ for (let i = 0; i + 4 <= data.length; i += 4){ if ((data[i] === 0x40 && (data[i + 1] & 0xC0) === 0) || (data[i] === 0x7F && (data[i + 1] & 0xC0) === 0xC0)){ let src = ((data[i] << 24) | (data[i + 1] << 16) | (data[i + 2] << 8) | data[i + 3]) >>> 0; src = (src << 2) >>> 0; let dest = (src - i) >>> 0; dest >>>= 2; dest = ((((0 - ((dest >>> 22) & 1)) << 22) & 0x3FFFFFFF) | (dest & 0x3FFFFF) | 0x40000000) >>> 0; data[i] = dest >>> 24; data[i + 1] = (dest >>> 16) & 0xFF; data[i + 2] = (dest >>> 8) & 0xFF; data[i + 3] = dest & 0xFF; } } return data; }
function delta(data, dist){ for (let i = dist; i < data.length; i++) data[i] = (data[i] + data[i - dist]) & 0xFF; return data; }
S7._filters = {x86, arm, armt, ppc, sparc, delta};

/* ===================== SHA-256 / AES (7zAES) ===================== */
const K256 = new Uint32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
class Sha256 {
  constructor(){ this.h = new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]); this.buf = new Uint8Array(64); this.bl = 0; this.len = 0; this.w = new Uint32Array(64); }
  block(b, o){
    const w = this.w, h = this.h;
    for (let i = 0; i < 16; i++) w[i] = (b[o + 4*i] << 24) | (b[o + 4*i + 1] << 16) | (b[o + 4*i + 2] << 8) | b[o + 4*i + 3];
    for (let i = 16; i < 64; i++){ const x = w[i - 15], y = w[i - 2]; const s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3); const s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10); w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0; }
    let a = h[0], b2 = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
    for (let i = 0; i < 64; i++){
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7)), ch = (e & f) ^ (~e & g), t1 = (hh + S1 + ch + K256[i] + w[i]) | 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10)), mj = (a & b2) ^ (a & c) ^ (b2 & c), t2 = (S0 + mj) | 0;
      hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b2; b2 = a; a = (t1 + t2) | 0;
    }
    h[0] += a; h[1] += b2; h[2] += c; h[3] += d; h[4] += e; h[5] += f; h[6] += g; h[7] += hh;
  }
  update(d){ this.len += d.length; let i = 0; if (this.bl){ while (this.bl < 64 && i < d.length) this.buf[this.bl++] = d[i++]; if (this.bl === 64){ this.block(this.buf, 0); this.bl = 0; } } for (; i + 64 <= d.length; i += 64) this.block(d, i); while (i < d.length) this.buf[this.bl++] = d[i++]; }
  digest(){ const bits = this.len * 8; const pad = new Uint8Array(((this.bl < 56) ? 56 : 120) - this.bl + 8); pad[0] = 0x80; const hi = Math.floor(bits / 4294967296), lo = bits >>> 0; const L = pad.length; pad[L - 8] = hi >>> 24; pad[L - 7] = hi >>> 16; pad[L - 6] = hi >>> 8; pad[L - 5] = hi; pad[L - 4] = lo >>> 24; pad[L - 3] = lo >>> 16; pad[L - 2] = lo >>> 8; pad[L - 1] = lo; this.update(pad); const o = new Uint8Array(32); for (let i = 0; i < 8; i++){ o[4*i] = this.h[i] >>> 24; o[4*i + 1] = this.h[i] >>> 16; o[4*i + 2] = this.h[i] >>> 8; o[4*i + 3] = this.h[i]; } return o; }
}
S7.sha256 = d => { const s = new Sha256(); s.update(d); return s.digest(); };
const keyCache = new Map();
function deriveKey(pw, salt, cyclesPower){
  const ck = cyclesPower + '|' + Array.from(salt).join(',') + '|' + pw;
  if (keyCache.has(ck)) return keyCache.get(ck);
  const pwb = new Uint8Array(pw.length * 2); for (let i = 0; i < pw.length; i++){ const c = pw.charCodeAt(i); pwb[2*i] = c & 255; pwb[2*i + 1] = c >> 8; }
  let key;
  if (cyclesPower === 0x3F){ key = new Uint8Array(32); key.set(salt.subarray(0, 32)); key.set(pwb.subarray(0, 32 - Math.min(32, salt.length)), Math.min(32, salt.length)); }
  else {
    const s = new Sha256(); const unit = new Uint8Array(salt.length + pwb.length + 8); unit.set(salt); unit.set(pwb, salt.length); const cOff = salt.length + pwb.length;
    const rounds = 2 ** cyclesPower;
    // 여러 번 반복한 묶음을 한꺼번에 넣어 빠르게
    const batch = Math.max(1, Math.min(rounds, Math.floor(65536 / unit.length))); const big = new Uint8Array(unit.length * batch);
    for (let r = 0; r < rounds; r += batch){
      const n = Math.min(batch, rounds - r);
      for (let k = 0; k < n; k++){ const o = k * unit.length; big.set(unit, o); let c = r + k; for (let j = 0; j < 8; j++){ big[o + cOff + j] = c & 255; c = Math.floor(c / 256); } }
      s.update(n === batch ? big : big.subarray(0, n * unit.length));
    }
    key = s.digest();
  }
  keyCache.set(ck, key); return key;
}
S7._deriveKey = deriveKey;
async function aesCbcDecryptNoPad(key, iv, data){
  if (data.length % 16) throw new Error('AES 데이터 길이 오류');
  if (!data.length) return data;
  const k = await crypto.subtle.importKey('raw', key, 'AES-CBC', false, ['encrypt', 'decrypt']);
  // WebCrypto는 패딩 검사를 하므로, 마지막에 '패딩 블록'을 암호화해 붙여서 복호화
  const last = data.subarray(data.length - 16);
  const padBlock = new Uint8Array(await crypto.subtle.encrypt({name:'AES-CBC', iv:last}, k, new Uint8Array(0))).subarray(0, 16);
  const all = new Uint8Array(data.length + 16); all.set(data); all.set(padBlock, data.length);
  return new Uint8Array(await crypto.subtle.decrypt({name:'AES-CBC', iv}, k, all));
}
S7._aes = aesCbcDecryptNoPad;
async function aesCoder(input, props, outSize, password){
  if (password == null) throw new MoaZip.PasswordError('암호가 필요합니다');
  const b0 = props[0], cyc = b0 & 0x3F; let salt = new Uint8Array(0), iv = new Uint8Array(16);
  if (b0 & 0xC0){ const b1 = props[1]; const ss = ((b0 >> 7) & 1) + (b1 >> 4), is = ((b0 >> 6) & 1) + (b1 & 0x0F); salt = props.slice(2, 2 + ss); iv.set(props.subarray(2 + ss, 2 + ss + is)); }
  if (cyc > 24 && cyc !== 0x3F) throw new Error('지원하지 않는 암호 설정입니다');
  const key = deriveKey(password, salt, cyc);
  const out = await aesCbcDecryptNoPad(key, iv, input);
  return out.subarray(0, outSize);
}

/* ===================== 7z 헤더 ===================== */
const METHODS = {'00':'Copy','030101':'LZMA','21':'LZMA2','040108':'Deflate','040109':'Deflate64','040202':'BZip2','030401':'PPMd','06f10701':'AES-256','03030103':'BCJ','0303011b':'BCJ2','03030205':'PPC','03030401':'IA64','03030501':'ARM','03030701':'ARMT','03030805':'SPARC','03':'Delta','0a':'ARM64','0b':'RISCV','04f71101':'Zstd','040204':'Zstd'};
S7.methodName = id => METHODS[id] || ('방식 ' + id);
class Reader {
  constructor(b){ this.b = b; this.p = 0; }
  byte(){ if (this.p >= this.b.length) throw new Error('7z 헤더가 손상되었습니다'); return this.b[this.p++]; }
  num(){
    const first = this.byte(); let mask = 0x80, v = 0;
    for (let i = 0; i < 8; i++){
      if ((first & mask) === 0){ const high = first & (mask - 1); return v + high * 2 ** (8 * i); }
      v += this.byte() * 2 ** (8 * i); mask >>= 1;
    }
    return v;
  }
  u32(){ const b = this.b, p = this.p; this.p += 4; return (b[p] | b[p + 1] << 8 | b[p + 2] << 16 | b[p + 3] << 24) >>> 0; }
  u64(){ const lo = this.u32(), hi = this.u32(); return hi * 4294967296 + lo; }
  bytes(n){ const r = this.b.subarray(this.p, this.p + n); this.p += n; return r; }
  bits(n){ const v = []; let mask = 0, cur = 0; for (let i = 0; i < n; i++){ if (!mask){ cur = this.byte(); mask = 0x80; } v.push(!!(cur & mask)); mask >>= 1; } return v; }
  defined(n){ const all = this.byte(); return all ? new Array(n).fill(true) : this.bits(n); }
}
function readDigests(r, n){ const def = r.defined(n); return def.map(d => d ? r.u32() : null); }
function readPackInfo(r, si){
  si.packPos = r.num(); const n = r.num(); si.packSizes = new Array(n).fill(0);
  for (;;){ const id = r.num(); if (id === 0) break; if (id === 9) for (let i = 0; i < n; i++) si.packSizes[i] = r.num(); else if (id === 10) readDigests(r, n); else throw new Error('7z PackInfo 오류'); }
}
function readFolder(r){
  const nc = r.num(), coders = []; let tin = 0, tout = 0;
  for (let i = 0; i < nc; i++){
    const flag = r.byte(); const idSize = flag & 0x0F; const id = Array.from(r.bytes(idSize), x => x.toString(16).padStart(2, '0')).join('');
    let ni = 1, no = 1; if (flag & 0x10){ ni = r.num(); no = r.num(); }
    let props = new Uint8Array(0); if (flag & 0x20){ props = r.bytes(r.num()).slice(); }
    if (flag & 0x80) throw new Error('7z 대체 방식은 지원하지 않습니다');
    coders.push({id, ni, no, props, inStart:tin, outStart:tout}); tin += ni; tout += no;
  }
  const bind = []; for (let i = 0; i < tout - 1; i++) bind.push({inIndex:r.num(), outIndex:r.num()});
  const npacked = tin - bind.length; const packed = [];
  if (npacked === 1){ for (let i = 0; i < tin; i++) if (!bind.some(b => b.inIndex === i)){ packed.push(i); break; } }
  else for (let i = 0; i < npacked; i++) packed.push(r.num());
  return {coders, bind, packed, tin, tout, unpackSizes:[], crc:null};
}
function readUnpackInfo(r, si){
  if (r.num() !== 11) throw new Error('7z 폴더 정보가 없습니다');
  const n = r.num(); if (r.byte() !== 0) throw new Error('7z 외부 폴더 정보는 지원하지 않습니다');
  si.folders = []; for (let i = 0; i < n; i++) si.folders.push(readFolder(r));
  if (r.num() !== 12) throw new Error('7z 크기 정보가 없습니다');
  for (const f of si.folders) for (let i = 0; i < f.tout; i++) f.unpackSizes.push(r.num());
  for (;;){ const id = r.num(); if (id === 0) break; if (id === 10){ const d = readDigests(r, n); d.forEach((c, i) => si.folders[i].crc = c); } else throw new Error('7z UnpackInfo 오류'); }
}
function folderSize(f){ const mainOut = mainOutIndex(f); return f.unpackSizes[mainOut]; }
function mainOutIndex(f){ for (let i = 0; i < f.tout; i++) if (!f.bind.some(b => b.outIndex === i)) return i; throw new Error('7z 폴더 구조 오류'); }
function readSubStreams(r, si){
  const F = si.folders; F.forEach(f => f.numSub = 1);
  let id = r.num();
  if (id === 13){ F.forEach(f => f.numSub = r.num()); id = r.num(); }
  si.subSizes = []; si.subCrcs = [];
  if (id === 9){ F.forEach(f => { let sum = 0; for (let i = 1; i < f.numSub; i++){ const s = r.num(); si.subSizes.push(s); sum += s; } if (f.numSub) si.subSizes.push(folderSize(f) - sum); }); id = r.num(); }
  else F.forEach(f => { if (f.numSub === 1) si.subSizes.push(folderSize(f)); else for (let i = 0; i < f.numSub; i++) si.subSizes.push(0); });
  // CRC
  F.forEach(f => { for (let i = 0; i < f.numSub; i++) si.subCrcs.push(f.numSub === 1 && f.crc != null ? f.crc : undefined); });
  const unknown = si.subCrcs.filter(c => c === undefined).length;
  if (id === 10){ const d = readDigests(r, unknown); let k = 0; si.subCrcs = si.subCrcs.map(c => c === undefined ? d[k++] : c); id = r.num(); }
  while (id !== 0){ r.bytes(r.num()); id = r.num(); }
}
function readStreamsInfo(r){
  const si = {packPos:0, packSizes:[], folders:[]};
  for (;;){ const id = r.num(); if (id === 0) break;
    if (id === 6) readPackInfo(r, si); else if (id === 7) readUnpackInfo(r, si); else if (id === 8) readSubStreams(r, si); else throw new Error('7z 스트림 정보 오류 (' + id + ')'); }
  if (!si.subSizes){ si.folders.forEach(f => f.numSub = 1); si.subSizes = si.folders.map(folderSize); si.subCrcs = si.folders.map(f => f.crc); }
  return si;
}
function filetime(r){ const lo = r.u32(), hi = r.u32(); const ms = (hi * 4294967296 + lo) / 10000 - 11644473600000; return new Date(ms); }
function readFiles(r){
  const n = r.num(); const files = Array.from({length:n}, () => ({name:'', emptyStream:false, emptyFile:false, attr:null, mtime:null, anti:false}));
  for (;;){
    const type = r.num(); if (type === 0) break;
    const size = r.num(); const end = r.p + size;
    if (type === 14){ r.bits(n).forEach((v, i) => files[i].emptyStream = v); }
    else if (type === 15){ const es = files.filter(f => f.emptyStream); r.bits(es.length).forEach((v, i) => es[i].emptyFile = v); }
    else if (type === 16){ const es = files.filter(f => f.emptyStream); r.bits(es.length).forEach((v, i) => es[i].anti = v); }
    else if (type === 17){ if (r.byte() !== 0) throw new Error('7z 외부 이름은 지원하지 않습니다'); for (const f of files){ let s = ''; for (;;){ const c = r.b[r.p] | (r.b[r.p + 1] << 8); r.p += 2; if (!c) break; s += String.fromCharCode(c); } f.name = s; } }
    else if (type === 20){ const def = r.defined(n); if (r.byte() !== 0) throw new Error('7z 외부 시간 정보'); def.forEach((d, i) => { if (d) files[i].mtime = filetime(r); }); }
    else if (type === 21){ const def = r.defined(n); if (r.byte() !== 0) throw new Error('7z 외부 속성 정보'); def.forEach((d, i) => { if (d) files[i].attr = r.u32(); }); }
    r.p = end;
  }
  return files;
}

/* 폴더(묶음) 풀기 */
async function runCoder(c, inputs, outSize, password){
  const inp = inputs[0];
  switch (c.id){
    case '00': return inp.subarray(0, outSize);
    case '030101': return S7.lzma(inp, c.props, outSize);
    case '21': return S7.lzma2(inp, c.props, outSize);
    case '040108': { const o = pako.inflateRaw(inp); return o.subarray(0, outSize); }
    case '040202': return S7.bzip2(inp, c.props, outSize);
    case '06f10701': return aesCoder(inp, c.props, outSize, password);
    case '03030103': return x86(inp.slice(0, outSize), 0);
    case '03030501': return arm(inp.slice(0, outSize));
    case '03030701': return armt(inp.slice(0, outSize));
    case '03030205': return ppc(inp.slice(0, outSize));
    case '03030805': return sparc(inp.slice(0, outSize));
    case '03': return delta(inp.slice(0, outSize), (c.props[0] || 0) + 1);
    default: throw new Error(`'${S7.methodName(c.id)}' 압축 방식은 지원하지 않습니다`);
  }
}
async function decodeFolder(arc, fi, password){
  const si = arc.si, f = si.folders[fi];
  let packIdx = 0; for (let i = 0; i < fi; i++) packIdx += si.folders[i].packed.length;
  let off = 32 + si.packPos; for (let i = 0; i < packIdx; i++) off += si.packSizes[i];
  const packs = [];
  for (let k = 0; k < f.packed.length; k++){ const sz = si.packSizes[packIdx + k]; packs.push(arc.read ? await arc.read(off, off + sz) : arc.buf.subarray(off, off + sz)); off += sz; }
  const memo = new Map();
  const getOut = async outIdx => {
    if (memo.has(outIdx)) return memo.get(outIdx);
    const c = f.coders.find(c => outIdx >= c.outStart && outIdx < c.outStart + c.no);
    if (c.no !== 1) throw new Error(`'${S7.methodName(c.id)}' 방식은 지원하지 않습니다`);
    const inputs = [];
    for (let j = 0; j < c.ni; j++){
      const inIdx = c.inStart + j, bp = f.bind.find(b => b.inIndex === inIdx);
      inputs.push(bp ? await getOut(bp.outIndex) : packs[f.packed.indexOf(inIdx)]);
    }
    const r = await runCoder(c, inputs, f.unpackSizes[outIdx], password);
    memo.set(outIdx, r); return r;
  };
  return getOut(mainOutIndex(f));
}
S7.isEncrypted = f => f.coders.some(c => c.id === '06f10701');

/* 7z 열기 */
S7.open = async function(file, nameEnc){
  const head = new Uint8Array(await file.slice(0, 32).arrayBuffer());
  if (!(head[0] === 0x37 && head[1] === 0x7A && head[2] === 0xBC && head[3] === 0xAF && head[4] === 0x27 && head[5] === 0x1C)) throw new Error('7z 파일이 아닙니다');
  const hr = new Reader(head); hr.p = 12;
  const nextOff = hr.u64(), nextSize = hr.u64(), nextCrc = hr.u32();
  if (32 + nextOff + nextSize > file.size) throw new Error('7z 파일이 잘렸거나 분할 압축의 일부입니다 (.7z.001 등은 하나로 합쳐 주세요)');
  const read = async (a, b) => new Uint8Array(await file.slice(a, b).arrayBuffer());
  const arc = {type:'7z', file, read, entries:[], comment:'', folderCache:new Map()};
  let hb = await read(32 + nextOff, 32 + nextOff + nextSize);
  if (nextSize && Moa.crc32(hb) !== nextCrc) throw new Error('7z 헤더 CRC 오류 (파일이 손상되었습니다)');
  if (!nextSize) return arc;
  let r = new Reader(hb), id = r.num(), headerPw = null;
  while (id === 0x17){ // 압축(또는 암호화)된 헤더
    const si = readStreamsInfo(r);
    const tmp = {si, read, buf:null};
    if (S7.isEncrypted(si.folders[0])){ arc.headerEncrypted = true; arc._encHeader = {si, read}; return arc; }
    hb = await decodeFolder(tmp, 0, null); r = new Reader(hb); id = r.num();
  }
  return parseHeader(arc, r, id);
};
function parseHeader(arc, r, id){
  if (id !== 1) throw new Error('7z 헤더 형식 오류');
  let si = {folders:[], subSizes:[], subCrcs:[]}, files = [];
  for (;;){
    const t = r.num(); if (t === 0) break;
    if (t === 2){ for (;;){ const pt = r.num(); if (pt === 0) break; r.bytes(r.num()); } }
    else if (t === 3) readStreamsInfo(r);
    else if (t === 4) si = readStreamsInfo(r);
    else if (t === 5) files = readFiles(r);
    else throw new Error('7z 헤더 항목 오류 (' + t + ')');
  }
  arc.si = si;
  let fi = 0, sub = 0, inFolder = 0, offInFolder = 0, sidx = 0;
  for (const f of files){
    const isDir = f.emptyStream && !f.emptyFile ? true : !!(f.attr != null && (f.attr & 0x10));
    const e = {name: f.name.replace(/\\/g, '/') + (isDir && !f.name.endsWith('/') ? '/' : ''), isDir, mtime: f.mtime || new Date(), usize:0, csize:0, crc:null, encrypted:false, method:'저장', realMethod:'저장', sevenz:true};
    if (!f.emptyStream){
      while (fi < si.folders.length && inFolder >= si.folders[fi].numSub){ fi++; inFolder = 0; offInFolder = 0; }
      const fo = si.folders[fi];
      e.folder = fi; e.offset = offInFolder; e.usize = si.subSizes[sidx]; e.crc = si.subCrcs[sidx] ?? null;
      e.encrypted = S7.isEncrypted(fo);
      e.methodName = e.method = e.realMethod = fo.coders.slice().reverse().map(c => S7.methodName(c.id)).join('+');
      offInFolder += e.usize; inFolder++; sidx++;
    }
    if (f.anti) continue;
    arc.entries.push(e);
  }
  // 압축 크기: 폴더 압축 크기를 파일 크기 비율로 나눔
  si.folders.forEach((fo, k) => {
    let packIdx = 0; for (let i = 0; i < k; i++) packIdx += si.folders[i].packed.length;
    let ps = 0; for (let i = 0; i < fo.packed.length; i++) ps += si.packSizes[packIdx + i] || 0;
    const es = arc.entries.filter(e => e.folder === k), tot = es.reduce((a, e) => a + e.usize, 0) || 1;
    es.forEach(e => e.csize = Math.round(ps * e.usize / tot));
  });
  arc.solid = si.folders.some(f => f.numSub > 1);
  return arc;
}
/* 암호화된 헤더 풀기 (파일 이름까지 숨긴 7z) */
S7.unlockHeader = async function(arc, password){
  const {si, read} = arc._encHeader;
  let hb;
  try { hb = await decodeFolder({si, read}, 0, password); } catch(e){ throw new MoaZip.PasswordError('암호가 맞지 않습니다'); }
  if (si.folders[0].crc != null && Moa.crc32(hb) !== si.folders[0].crc) throw new MoaZip.PasswordError('암호가 맞지 않습니다');
  let r = new Reader(hb), id = r.num();
  while (id === 0x17){ const s2 = readStreamsInfo(r); hb = await decodeFolder({si:s2, read}, 0, password); r = new Reader(hb); id = r.num(); }
  arc.headerEncrypted = false; delete arc._encHeader;
  return parseHeader(arc, r, id);
};
S7.extract = async function(arc, e, password){
  if (e.isDir || !e.usize) return new Uint8Array(0);
  const key = e.folder + '|' + (S7.isEncrypted(arc.si.folders[e.folder]) ? password : '');
  let data = arc.folderCache.get(key);
  if (!data){
    try { data = await decodeFolder(arc, e.folder, password); }
    catch(err){ if (e.encrypted && !(err instanceof MoaZip.PasswordError)) throw new MoaZip.PasswordError('암호가 맞지 않습니다'); throw err; }
    const f = arc.si.folders[e.folder];
    if (f.crc != null && Moa.crc32(data) !== f.crc){ if (e.encrypted) throw new MoaZip.PasswordError('암호가 맞지 않습니다'); throw new Error('CRC 오류 (파일이 손상되었습니다)'); }
    // 최근 폴더 2개만 기억 (메모리 절약)
    if (arc.folderCache.size >= 2) arc.folderCache.delete(arc.folderCache.keys().next().value);
    arc.folderCache.set(key, data);
  }
  const out = data.subarray(e.offset, e.offset + e.usize);
  if (e.crc != null && Moa.crc32(out) !== e.crc){ if (e.encrypted) throw new MoaZip.PasswordError('암호가 맞지 않습니다'); throw new Error('CRC 오류 (파일이 손상되었습니다): ' + e.name); }
  return out;
};

/* MoaZip에 연결 */
if (window.MoaZip){
  const Z = MoaZip, origOpen = Z.open, origExtract = Z.extract;
  Z.open = async function(file, enc){
    const h = new Uint8Array(await file.slice(0, 6).arrayBuffer());
    if (h[0] === 0x37 && h[1] === 0x7A && h[2] === 0xBC && h[3] === 0xAF) return S7.open(file, enc);
    return origOpen(file, enc);
  };
  Z.extract = (arc, e, pw) => arc.type === '7z' ? S7.extract(arc, e, pw) : origExtract(arc, e, pw);
  const origMethod = Z.methodName; Z.methodName = m => typeof m === 'string' ? m : origMethod(m);
}
window.Moa7z = S7;
})();

