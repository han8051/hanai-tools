/* HANAI Song 태그 라이브러리: ID3v1/ID3v2(2.2~2.4), FLAC, MP4(M4A), OGG 읽기 + ID3v2.3 쓰기 + LRC 변환 */
(function(){
const T = {};
const latin1 = new TextDecoder('latin1');
const utf8 = new TextDecoder('utf-8');
const u16le = new TextDecoder('utf-16le'), u16be = new TextDecoder('utf-16be');

/* 한글 MP3는 'ISO-8859-1'로 표시되어 있어도 실제론 CP949인 경우가 많음 */
function decodeLegacy(b){
  let high = false; for (const x of b) if (x > 0x7f){ high = true; break; }
  if (!high) return latin1.decode(b);
  try { return new TextDecoder('utf-8',{fatal:true}).decode(b); } catch(e){}
  try { return new TextDecoder('euc-kr').decode(b); } catch(e){ return latin1.decode(b); }
}
function decodeEnc(enc, b){
  if (!b.length) return '';
  switch(enc){
    case 0: return decodeLegacy(b);
    case 1:
      if (b[0]===0xFF && b[1]===0xFE) return u16le.decode(b.subarray(2));
      if (b[0]===0xFE && b[1]===0xFF) return u16be.decode(b.subarray(2));
      return u16le.decode(b);
    case 2: return u16be.decode(b);
    default: return utf8.decode(b);
  }
}
/* 인코딩별 종료 문자 위치 */
function findTerm(b, start, enc){
  if (enc === 1 || enc === 2){
    for (let i = start; i + 1 < b.length; i += 2) if (b[i]===0 && b[i+1]===0) return i;
    return b.length;
  }
  for (let i = start; i < b.length; i++) if (b[i]===0) return i;
  return b.length;
}
const termLen = enc => (enc===1||enc===2) ? 2 : 1;
const clean = s => s.replace(/\u0000+$/,'').replace(/\u0000/g,' / ').trim();
const ss = (b,o) => (b[o]&0x7f)<<21 | (b[o+1]&0x7f)<<14 | (b[o+2]&0x7f)<<7 | (b[o+3]&0x7f);
const be32 = (b,o) => ((b[o]<<24)>>>0) + (b[o+1]<<16) + (b[o+2]<<8) + b[o+3];
const be24 = (b,o) => (b[o]<<16) + (b[o+1]<<8) + b[o+2];
const le32 = (b,o) => (b[o] | b[o+1]<<8 | b[o+2]<<16 | b[o+3]<<24) >>> 0;
function deUnsync(b){ const out = new Uint8Array(b.length); let j = 0; for (let i=0;i<b.length;i++){ out[j++] = b[i]; if (b[i]===0xFF && b[i+1]===0x00) i++; } return out.subarray(0,j); }

const GENRES = ['Blues','Classic Rock','Country','Dance','Disco','Funk','Grunge','Hip-Hop','Jazz','Metal','New Age','Oldies','Other','Pop','R&B','Rap','Reggae','Rock','Techno','Industrial','Alternative','Ska','Death Metal','Pranks','Soundtrack','Euro-Techno','Ambient','Trip-Hop','Vocal','Jazz+Funk','Fusion','Trance','Classical','Instrumental','Acid','House','Game','Sound Clip','Gospel','Noise','AlternRock','Bass','Soul','Punk','Space','Meditative','Instrumental Pop','Instrumental Rock','Ethnic','Gothic','Darkwave','Techno-Industrial','Electronic','Pop-Folk','Eurodance','Dream','Southern Rock','Comedy','Cult','Gangsta','Top 40','Christian Rap','Pop/Funk','Jungle','Native American','Cabaret','New Wave','Psychadelic','Rave','Showtunes','Trailer','Lo-Fi','Tribal','Acid Punk','Acid Jazz','Polka','Retro','Musical','Rock & Roll','Hard Rock'];
T.GENRES = GENRES;
function genreName(g){
  const m = String(g||'').match(/^\((\d+)\)(.*)$/);
  if (m) return m[2] || GENRES[+m[1]] || g;
  if (/^\d+$/.test(g)) return GENRES[+g] || g;
  return g;
}

/* ---------- ID3v2 ---------- */
function parseID3v2(u, tag){
  if (!(u[0]===0x49 && u[1]===0x44 && u[2]===0x33)) return 0;
  const ver = u[3], flags = u[5], size = ss(u,6);
  const total = 10 + size + (flags & 0x10 ? 10 : 0);
  let body = u.subarray(10, Math.min(u.length, 10 + size));
  if (ver < 4 && (flags & 0x80)) body = deUnsync(body);
  let p = 0;
  if (flags & 0x40){ p = ver === 4 ? ss(body,0) : be32(body,0) + 4; }
  tag.format = 'MP3'; tag.tagVersion = 'ID3v2.' + ver;
  const idLen = ver === 2 ? 3 : 4, hdrLen = ver === 2 ? 6 : 10;
  while (p + hdrLen <= body.length){
    const id = latin1.decode(body.subarray(p, p+idLen));
    if (!/^[A-Z0-9]+$/.test(id)) break;
    let fsize = ver === 2 ? be24(body,p+3) : ver === 4 ? ss(body,p+4) : be32(body,p+4);
    const fflags = ver === 2 ? 0 : (body[p+8]<<8 | body[p+9]);
    p += hdrLen;
    if (fsize <= 0 || p + fsize > body.length) break;
    let fb = body.subarray(p, p + fsize); p += fsize;
    if (ver === 4){
      if (fflags & 0x0002) fb = deUnsync(fb);
      if (fflags & 0x0001) fb = fb.subarray(4); // data length indicator
      if (fflags & 0x000C) continue; // compressed / encrypted 미지원
    } else if (ver === 3 && (fflags & 0x00C0)) continue;
    try { handleFrame(id, fb, tag); } catch(e){ /* 손상된 프레임 무시 */ }
  }
  return total;
}
const TEXT_MAP = {TIT2:'title',TT2:'title',TPE1:'artist',TP1:'artist',TALB:'album',TAL:'album',TYER:'year',TYE:'year',TDRC:'year',TCON:'genre',TCO:'genre',TRCK:'track',TRK:'track',TPE2:'albumArtist',TP2:'albumArtist',TCOM:'composer',TCM:'composer',TPOS:'disc',TPA:'disc',TBPM:'bpm',TBP:'bpm',TENC:'encoder',TSSE:'encoderSettings',TPUB:'publisher',TEXT:'lyricist'};
function handleFrame(id, b, tag){
  if (TEXT_MAP[id]){
    let v = clean(decodeEnc(b[0], b.subarray(1)));
    if (TEXT_MAP[id] === 'genre') v = genreName(v);
    if (TEXT_MAP[id] === 'year') v = v.slice(0,4);
    if (v) tag[TEXT_MAP[id]] = v;
  } else if (id === 'TXXX' || id === 'TXX'){
    const enc = b[0]; const d = findTerm(b, 1, enc);
    const desc = clean(decodeEnc(enc, b.subarray(1, d))).toUpperCase();
    const val = clean(decodeEnc(enc, b.subarray(d + termLen(enc))));
    if (desc === 'REPLAYGAIN_TRACK_GAIN') tag.rgTrack = parseFloat(val);
    else if (desc === 'REPLAYGAIN_ALBUM_GAIN') tag.rgAlbum = parseFloat(val);
  } else if (id === 'COMM' || id === 'COM'){
    const enc = b[0]; const d = findTerm(b, 4, enc);
    const txt = clean(decodeEnc(enc, b.subarray(d + termLen(enc))));
    const desc = clean(decodeEnc(enc, b.subarray(4, d)));
    if (txt && !/^iTun/.test(desc) && !tag.comment) tag.comment = txt;
  } else if (id === 'USLT' || id === 'ULT'){
    const enc = b[0]; tag.lyricsLang = latin1.decode(b.subarray(1,4));
    const d = findTerm(b, 4, enc);
    const txt = decodeEnc(enc, b.subarray(d + termLen(enc))).replace(/\u0000+$/,'');
    if (txt.trim()) tag.uslt = txt;
  } else if (id === 'SYLT' || id === 'SLT'){
    const enc = b[0], fmt = b[4];
    let p = findTerm(b, 6, enc) + termLen(enc);
    const lines = [];
    while (p < b.length){
      const e = findTerm(b, p, enc);
      let txt = decodeEnc(enc, b.subarray(p, e)); p = e + termLen(enc);
      if (p + 4 > b.length) break;
      const t = be32(b, p); p += 4;
      txt = txt.replace(/^﻿/,'').replace(/^\n/,'').replace(/\r/g,'');
      lines.push({t: fmt === 2 ? t/1000 : t/38.28, text: txt});
    }
    if (lines.length) tag.sylt = lines;
  } else if (id === 'APIC' || id === 'PIC'){
    const enc = b[0]; let p, mime;
    if (id === 'PIC'){ const f = latin1.decode(b.subarray(1,4)).toLowerCase(); mime = f === 'png' ? 'image/png' : 'image/jpeg'; p = 4; }
    else { const e = findTerm(b, 1, 0); mime = latin1.decode(b.subarray(1, e)) || 'image/jpeg'; p = e + 1; }
    const ptype = b[p]; p++;
    const d = findTerm(b, p, enc); p = d + termLen(enc);
    if (!mime.includes('/')) mime = 'image/' + mime.toLowerCase().replace('jpg','jpeg');
    if (!tag.picture || ptype === 3) tag.picture = {mime, data: b.slice(p), type: ptype};
  }
}

/* ---------- ID3v1 ---------- */
function parseID3v1(u, tag){
  if (u.length < 128) return false;
  const o = u.length - 128;
  if (!(u[o]===0x54 && u[o+1]===0x41 && u[o+2]===0x47)) return false;
  const f = (a, n) => { let s = u.subarray(o+a, o+a+n); let e = s.indexOf(0); if (e >= 0) s = s.subarray(0,e); return decodeLegacy(s).trim(); };
  tag.title ||= f(3,30); tag.artist ||= f(33,30); tag.album ||= f(63,30); tag.year ||= f(93,4);
  if (u[o+125] === 0 && u[o+126]) tag.track ||= String(u[o+126]);
  tag.comment ||= f(97, u[o+125] === 0 ? 28 : 30);
  if (u[o+127] < GENRES.length) tag.genre ||= GENRES[u[o+127]];
  tag.tagVersion ||= 'ID3v1';
  return true;
}

/* ---------- Vorbis comment (FLAC / OGG) ---------- */
const VC_MAP = {TITLE:'title',ARTIST:'artist',ALBUM:'album',DATE:'year',YEAR:'year',GENRE:'genre',TRACKNUMBER:'track',ALBUMARTIST:'albumArtist',COMPOSER:'composer',DISCNUMBER:'disc',COMMENT:'comment',DESCRIPTION:'comment',LYRICS:'uslt',UNSYNCEDLYRICS:'uslt',ORGANIZATION:'publisher'};
function parseVorbisComment(b, tag){
  let p = 0; const vlen = le32(b,p); p += 4 + vlen;
  const n = le32(b,p); p += 4;
  for (let i = 0; i < n && p + 4 <= b.length; i++){
    const len = le32(b,p); p += 4;
    const s = utf8.decode(b.subarray(p, p+len)); p += len;
    const eq = s.indexOf('='); if (eq < 0) continue;
    const k = s.slice(0,eq).toUpperCase(), v = s.slice(eq+1);
    if (VC_MAP[k]){ if (!tag[VC_MAP[k]]) tag[VC_MAP[k]] = VC_MAP[k]==='year'? v.slice(0,4) : v; }
    else if (k === 'REPLAYGAIN_TRACK_GAIN') tag.rgTrack = parseFloat(v);
    else if (k === 'REPLAYGAIN_ALBUM_GAIN') tag.rgAlbum = parseFloat(v);
    else if (k === 'METADATA_BLOCK_PICTURE'){ try { const bin = Uint8Array.from(atob(v), c=>c.charCodeAt(0)); parseFlacPicture(bin, tag); } catch(e){} }
  }
}
function parseFlacPicture(b, tag){
  let p = 0; const type = be32(b,p); p += 4;
  const ml = be32(b,p); p += 4; const mime = latin1.decode(b.subarray(p,p+ml)); p += ml;
  const dl = be32(b,p); p += 4 + dl; p += 16;
  const len = be32(b,p); p += 4;
  if (!tag.picture || type === 3) tag.picture = {mime: mime || 'image/jpeg', data: b.slice(p, p+len), type};
}
function parseFLAC(u, tag, start){
  let p = start + 4; tag.format = 'FLAC';
  while (p + 4 <= u.length){
    const h = u[p], last = h & 0x80, type = h & 0x7f, len = be24(u, p+1); p += 4;
    const b = u.subarray(p, p+len);
    if (type === 0 && len >= 18){
      tag.sampleRate = (b[10]<<12 | b[11]<<4 | b[12]>>4);
      tag.channels = ((b[12]>>1)&7) + 1;
      tag.bitsPerSample = (((b[12]&1)<<4) | (b[13]>>4)) + 1;
    }
    else if (type === 4) parseVorbisComment(b, tag);
    else if (type === 6) parseFlacPicture(b, tag);
    p += len; if (last) break;
  }
}
function parseOGG(u, tag){
  tag.format = 'OGG';
  const lim = Math.min(u.length, 1<<20);
  for (let i = 0; i < lim - 7; i++){
    if (u[i]===3 && u[i+1]===0x76 && u[i+2]===0x6f && u[i+3]===0x72 && u[i+4]===0x62 && u[i+5]===0x69 && u[i+6]===0x73){ parseVorbisComment(u.subarray(i+7), tag); return; }
    if (u[i]===0x4f && u[i+1]===0x70 && u[i+2]===0x75 && u[i+3]===0x73 && u[i+4]===0x54 && u[i+5]===0x61 && u[i+6]===0x67 && u[i+7]===0x73){ tag.format='OPUS'; parseVorbisComment(u.subarray(i+8), tag); return; }
  }
}

/* ---------- MP4 / M4A ---------- */
function parseMP4(u, tag){
  tag.format = 'M4A';
  const dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
  const map = {'©nam':'title','©ART':'artist','©alb':'album','©day':'year','©gen':'genre','aART':'albumArtist','©wrt':'composer','©cmt':'comment','©lyr':'uslt','©too':'encoder'};
  function walk(s, e, path){
    let p = s;
    while (p + 8 <= e){
      let size = dv.getUint32(p); const type = latin1.decode(u.subarray(p+4, p+8));
      let hdr = 8;
      if (size === 1){ size = Number(dv.getBigUint64(p+8)); hdr = 16; } else if (size === 0) size = e - p;
      if (size < 8) break;
      const cs = p + hdr, ce = Math.min(e, p + size);
      if (['moov','udta','ilst','trak','mdia','minf','stbl'].includes(type)) walk(cs, ce, path + '/' + type);
      else if (type === 'meta') walk(cs + 4, ce, path + '/meta');
      else if (type === 'mdhd'){ const v = u[cs]; const ts = v ? dv.getUint32(cs+20) : dv.getUint32(cs+12); const du = v ? Number(dv.getBigUint64(cs+24)) : dv.getUint32(cs+16); if (ts) tag.mp4Duration = du/ts; }
      else if (path.endsWith('/ilst')){
        // 아이템 안의 data 박스
        let q = cs;
        while (q + 16 <= ce){
          const ds = dv.getUint32(q), dt = latin1.decode(u.subarray(q+4,q+8));
          if (dt === 'data'){
            const kind = dv.getUint32(q+8) & 0xffffff; const val = u.subarray(q+16, q+ds);
            if (map[type]){ const v = utf8.decode(val); if (!tag[map[type]]) tag[map[type]] = map[type]==='year'? v.slice(0,4): v; }
            else if (type === 'trkn' && val.length >= 4){ tag.track = String(val[3] | val[2]<<8) + (val[5] ? '/' + val[5] : ''); }
            else if (type === 'disk' && val.length >= 4){ tag.disc = String(val[3]); }
            else if (type === 'gnre' && val.length >= 2){ tag.genre ||= GENRES[(val[0]<<8|val[1]) - 1]; }
            else if (type === 'covr' && !tag.picture){ tag.picture = {mime: kind === 14 ? 'image/png' : 'image/jpeg', data: val.slice(), type:3}; }
          }
          if (ds < 8) break; q += ds;
        }
      }
      p += size;
    }
  }
  walk(0, u.length, '');
}

/* 오디오 파일에서 태그 읽기 */
T.read = async function(file){
  const tag = {};
  try {
    tag.size = file.size;
    const name = (file.name||'').toLowerCase();
    const rd = async (a, b) => new Uint8Array(await file.slice(a, b).arrayBuffer());
    const head = await rd(0, 16);
    const tail = file.size >= 128 ? await rd(file.size - 128, file.size) : new Uint8Array(0);
    if (head[0]===0x49 && head[1]===0x44 && head[2]===0x33){
      const tagEnd = 10 + ss(head,6) + 10;
      const buf = await rd(0, Math.min(file.size, tagEnd + 70000));
      const off = parseID3v2(buf, tag);
      if (buf[off]===0x66 && buf[off+1]===0x4c && buf[off+2]===0x61 && buf[off+3]===0x43){ parseFLAC(await rd(0, Math.min(file.size, off + (16<<20))), tag, off); }
      else { parseID3v1(tail, tag); mp3Info(buf, off, tag); }
    } else if (head[0]===0x66 && head[1]===0x4c && head[2]===0x61 && head[3]===0x43) parseFLAC(await rd(0, Math.min(file.size, 16<<20)), tag, 0);
    else if (head[4]===0x66 && head[5]===0x74 && head[6]===0x79 && head[7]===0x70) parseMP4(await rd(0, file.size), tag);
    else if (head[0]===0x4f && head[1]===0x67 && head[2]===0x67 && head[3]===0x53) parseOGG(await rd(0, Math.min(file.size, 4<<20)), tag);
    else if (head[0]===0x52 && head[1]===0x49 && head[2]===0x46 && head[3]===0x46){ tag.format = 'WAV'; wavInfo(await rd(0, Math.min(file.size, 1<<20)), tag); }
    else { const b = await rd(0, Math.min(file.size, 70000)); if (parseID3v1(tail, tag) || /\.mp3$/.test(name)){ tag.format = 'MP3'; mp3Info(b, 0, tag); } }
    if (!tag.format){ const ext = name.split('.').pop(); tag.format = ext ? ext.toUpperCase() : ''; }
  } catch(e){ console.warn('태그 읽기 실패', e); }
  return tag;
};
const BR = {1:[0,32,40,48,56,64,80,96,112,128,160,192,224,256,320], 2:[0,8,16,24,32,40,48,56,64,80,96,112,128,144,160]};
const SR = {3:[44100,48000,32000], 2:[22050,24000,16000], 0:[11025,12000,8000]};
function mp3Info(u, off, tag){
  for (let i = off; i < Math.min(u.length - 4, off + 65536); i++){
    if (u[i] === 0xFF && (u[i+1] & 0xE0) === 0xE0){
      const ver = (u[i+1] >> 3) & 3, layer = (u[i+1] >> 1) & 3, bri = u[i+2] >> 4, sri = (u[i+2] >> 2) & 3;
      if (ver === 1 || layer !== 1 || bri === 0 || bri === 15 || sri === 3) continue;
      tag.bitrate = BR[ver === 3 ? 1 : 2][bri]; tag.sampleRate = SR[ver][sri];
      tag.channels = (u[i+3] >> 6) === 3 ? 1 : 2;
      // Xing/VBRI 확인 → VBR
      const s = latin1.decode(u.subarray(i, i + 200));
      if (s.includes('Xing') || s.includes('VBRI')) tag.vbr = true;
      return;
    }
  }
}
function wavInfo(u, tag){
  const dv = new DataView(u.buffer, u.byteOffset);
  let p = 12;
  while (p + 8 < u.length){
    const id = latin1.decode(u.subarray(p,p+4)), sz = dv.getUint32(p+4, true);
    if (id === 'fmt '){ tag.channels = dv.getUint16(p+10,true); tag.sampleRate = dv.getUint32(p+12,true); tag.bitsPerSample = dv.getUint16(p+22,true); }
    if (id === 'LIST' && latin1.decode(u.subarray(p+8,p+12)) === 'INFO'){
      let q = p + 12; const m = {INAM:'title',IART:'artist',IPRD:'album',ICRD:'year',IGNR:'genre',ICMT:'comment',ITRK:'track'};
      while (q + 8 < p + 8 + sz){ const k = latin1.decode(u.subarray(q,q+4)), l = dv.getUint32(q+4,true); if (m[k]) tag[m[k]] = decodeLegacy(u.subarray(q+8, q+8+l)).replace(/\0+$/,''); q += 8 + l + (l&1); }
    }
    p += 8 + sz + (sz & 1);
  }
}

/* ---------- LRC ---------- */
T.parseLRC = function(text){
  const out = []; let offset = 0; const meta = {};
  String(text).split(/\r?\n/).forEach(line => {
    const mm = line.match(/^\[(ti|ar|al|by|offset|length|re|ve|au):(.*)\]\s*$/i);
    if (mm){ meta[mm[1].toLowerCase()] = mm[2].trim(); if (mm[1].toLowerCase()==='offset') offset = (+mm[2]||0)/1000; return; }
    const tags = [...line.matchAll(/\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g)];
    if (!tags.length) return;
    // ALSong 방식의 <00:12.34> 단어별 타임코드 제거
    const txt = line.replace(/\[[^\]]*\]/g,'').replace(/<\d+:\d+(?:[.:]\d+)?>/g,'').trim();
    tags.forEach(m => { const frac = m[3] ? +('0.' + m[3].padEnd(3,'0').slice(0,3)) : 0; out.push({t: +m[1]*60 + +m[2] + frac, text: txt}); });
  });
  out.forEach(l => l.t = Math.max(0, l.t - offset));
  out.sort((a,b) => a.t - b.t);
  // 같은 시간대 줄(번역/발음 줄)을 묶음
  const merged = [];
  for (const l of out){
    const last = merged[merged.length-1];
    if (last && Math.abs(last.t - l.t) < 0.01){ if (l.text) last.sub = (last.sub ? last.sub + '\n' : '') + l.text; }
    else merged.push({t:l.t, text:l.text});
  }
  merged.meta = meta;
  return merged;
};
const ts = t => { t = Math.max(0, t); const m = Math.floor(t/60), s = t - m*60; return '[' + String(m).padStart(2,'0') + ':' + s.toFixed(2).padStart(5,'0') + ']'; };
T.lrcTime = ts;
T.toLRC = function(lines, meta={}){
  const head = Object.entries(meta).filter(([k,v])=>v).map(([k,v]) => `[${k}:${v}]`);
  const body = [];
  lines.forEach(l => { body.push(ts(l.t) + (l.text||'')); if (l.sub) l.sub.split('\n').forEach(s => body.push(ts(l.t) + s)); });
  return head.concat(body).join('\r\n');
};
/* USLT 안에 LRC가 통째로 들어있는 경우 */
T.lyricsFromTag = function(tag){
  if (tag.sylt && tag.sylt.length){
    const lines = tag.sylt.map(l => ({t:l.t, text:l.text})).sort((a,b)=>a.t-b.t);
    const m = []; for (const l of lines){ const last = m[m.length-1]; if (last && Math.abs(last.t-l.t) < 0.01){ if (l.text) last.sub = (last.sub?last.sub+'\n':'')+l.text; } else m.push(l); }
    return {synced:true, lines:m, source:'SYLT'};
  }
  if (tag.uslt){
    if (/\[\d{1,3}:\d{1,2}([.:]\d+)?\]/.test(tag.uslt)){ const l = T.parseLRC(tag.uslt); if (l.length) return {synced:true, lines:l, source:'USLT(LRC)'}; }
    return {synced:false, lines: tag.uslt.split(/\r?\n/).map(text => ({t:-1, text})), source:'USLT'};
  }
  return null;
};

/* ---------- ID3v2.3 쓰기 ---------- */
function u16(str){ const b = new Uint8Array(2 + str.length*2); b[0]=0xFF; b[1]=0xFE; for (let i=0;i<str.length;i++){ const c = str.charCodeAt(i); b[2+i*2]=c&255; b[3+i*2]=c>>8; } return b; }
function cat(arrs){ const n = arrs.reduce((a,b)=>a+b.length,0); const o = new Uint8Array(n); let p = 0; for (const a of arrs){ o.set(a,p); p += a.length; } return o; }
const asc = s => Uint8Array.from(s, c => c.charCodeAt(0) & 255);
const B = (...x) => Uint8Array.from(x);
const be32b = n => B(n>>>24&255, n>>>16&255, n>>>8&255, n&255);
function frame(id, data){ return cat([asc(id), be32b(data.length), B(0,0), data]); }
function textFrame(id, v){ return frame(id, cat([B(1), u16(v)])); }
T.buildID3 = function(tag){
  const fr = [];
  const tx = {title:'TIT2', artist:'TPE1', album:'TALB', year:'TYER', genre:'TCON', track:'TRCK', albumArtist:'TPE2', composer:'TCOM', disc:'TPOS'};
  for (const k in tx) if (tag[k]) fr.push(textFrame(tx[k], String(tag[k])));
  if (tag.comment) fr.push(frame('COMM', cat([B(1), asc('kor'), u16(''), B(0,0), u16(tag.comment)])));
  if (tag.uslt) fr.push(frame('USLT', cat([B(1), asc('kor'), u16(''), B(0,0), u16(tag.uslt)])));
  if (tag.sylt && tag.sylt.length){
    const parts = [B(1), asc('kor'), B(2, 1), u16(''), B(0,0)];
    tag.sylt.forEach(l => { parts.push(u16(l.text||' '), B(0,0), be32b(Math.round(l.t*1000))); if (l.sub) l.sub.split('\n').forEach(s => parts.push(u16(s), B(0,0), be32b(Math.round(l.t*1000)))); });
    fr.push(frame('SYLT', cat(parts)));
  }
  if (tag.picture && tag.picture.data) fr.push(frame('APIC', cat([B(0), asc(tag.picture.mime||'image/jpeg'), B(0, 3, 0), tag.picture.data])));
  const body = cat(fr); const pad = new Uint8Array(2048);
  const size = body.length + pad.length;
  const hdr = cat([asc('ID3'), B(3,0,0), B(size>>21&127, size>>14&127, size>>7&127, size&127)]);
  return cat([hdr, body, pad]);
};
/* 기존 ID3v2 제거 후 새 태그 붙이기 */
T.writeMP3 = async function(file, tag){
  const u = new Uint8Array(await file.arrayBuffer());
  let start = 0;
  while (u[start]===0x49 && u[start+1]===0x44 && u[start+2]===0x33){ start += 10 + ss(u,start+6) + (u[start+5] & 0x10 ? 10 : 0); }
  let end = u.length;
  if (end >= 128 && u[end-128]===0x54 && u[end-127]===0x41 && u[end-126]===0x47) end -= 128;
  return new Blob([T.buildID3(tag), u.subarray(start, end)], {type:'audio/mpeg'});
};

window.MoaTags = T;
})();
