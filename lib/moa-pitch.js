/* HANAI 음정(키) 조절: 재생 속도는 그대로 두고 음 높이만 바꾸는 AudioWorklet (두 갈래 지연선 방식) */
(function(){
const CODE = `
class HanaiPitch extends AudioWorkletProcessor {
  static get parameterDescriptors(){ return [{name:'ratio', defaultValue:1, minValue:0.25, maxValue:4, automationRate:'k-rate'}]; }
  constructor(){
    super();
    this.N = 1 << 15; this.mask = this.N - 1;
    this.buf = [new Float32Array(this.N), new Float32Array(this.N)];
    this.w = 0; this.ph = 0;
    this.W = Math.round(sampleRate * 0.045); // 창 길이 약 45ms
  }
  read(b, pos){ const i = Math.floor(pos), f = pos - i; const a = b[i & this.mask], c = b[(i + 1) & this.mask]; return a + (c - a) * f; }
  process(inputs, outputs, params){
    const inp = inputs[0], out = outputs[0]; const ratio = params.ratio[0];
    const n = out[0].length, chs = out.length;
    if (!inp || !inp.length){ for (const o of out) o.fill(0); return true; }
    const W = this.W, step = (1 - ratio) / W;
    for (let i = 0; i < n; i++){
      const w = this.w;
      for (let c = 0; c < 2; c++){ const src = inp[Math.min(c, inp.length - 1)]; this.buf[c][w & this.mask] = src ? src[i] : 0; }
      if (ratio === 1){
        for (let c = 0; c < chs; c++){ const src = inp[Math.min(c, inp.length - 1)]; out[c][i] = src ? src[i] : 0; }
      } else {
        let ph1 = this.ph, ph2 = ph1 + 0.5; if (ph2 >= 1) ph2 -= 1;
        const d1 = ph1 * W + 1, d2 = ph2 * W + 1;
        const s1 = Math.sin(Math.PI * ph1), s2 = Math.sin(Math.PI * ph2);
        const g1 = s1 * s1, g2 = s2 * s2;
        for (let c = 0; c < chs; c++){ const b = this.buf[Math.min(c, 1)]; out[c][i] = this.read(b, w - d1) * g1 + this.read(b, w - d2) * g2; }
        let p = this.ph + step; p -= Math.floor(p); this.ph = p;
      }
      this.w = w + 1;
    }
    return true;
  }
}
registerProcessor('hanai-pitch', HanaiPitch);
`;
const MoaPitch = {};
const loaded = new WeakMap();
MoaPitch.create = async function(ctx){
  if (!ctx.audioWorklet) throw new Error('이 브라우저는 음정 조절을 지원하지 않습니다');
  if (!loaded.get(ctx)){
    // file:// 에서는 blob 주소가 막히므로 data 주소로 불러옴
    const url = 'data:text/javascript;charset=utf-8,' + encodeURIComponent(CODE);
    loaded.set(ctx, ctx.audioWorklet.addModule(url));
  }
  await loaded.get(ctx);
  return new AudioWorkletNode(ctx, 'hanai-pitch', {numberOfInputs:1, numberOfOutputs:1, outputChannelCount:[2], channelCount:2, channelCountMode:'explicit'});
};
MoaPitch.ratio = semis => Math.pow(2, semis / 12);
window.MoaPitch = MoaPitch;
})();

