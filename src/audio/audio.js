/**
 * Sonido procedural: no hay ni un archivo de audio, todo se sintetiza.
 * Cada mente escucha a través de su propio "cuerpo" (filtros, velocidad, resonancias).
 */
export class Audio {
  constructor() {
    this.ctx = null;
    this.sources = [];
    this.listeners = [];
  }

  start() {
    if (this.ctx) return;
    const ctx = (this.ctx = new (window.AudioContext || window.webkitAudioContext)());
    // cadena maestra: fuentes -> cuerpo (filtro) -> resonador -> compresor -> salida
    this.master = ctx.createGain(); this.master.gain.value = 0;
    this.body = ctx.createBiquadFilter(); this.body.type = 'lowpass'; this.body.frequency.value = 18000; this.body.Q.value = 0.5;
    this.tone = ctx.createBiquadFilter(); this.tone.type = 'peaking'; this.tone.frequency.value = 1000; this.tone.gain.value = 0; this.tone.Q.value = 1;
    this.low = ctx.createBiquadFilter(); this.low.type = 'lowshelf'; this.low.frequency.value = 160; this.low.gain.value = 0;
    this.comp = ctx.createDynamicsCompressor(); this.comp.threshold.value = -18; this.comp.ratio.value = 3;
    this.input = ctx.createGain();
    // reverberación corta de cocina
    this.verb = ctx.createConvolver(); this.verb.buffer = this.impulse(1.4, 3.2);
    this.verbGain = ctx.createGain(); this.verbGain.gain.value = 0.18;
    this.input.connect(this.body); this.body.connect(this.tone); this.tone.connect(this.low); this.low.connect(this.comp);
    this.input.connect(this.verb); this.verb.connect(this.verbGain); this.verbGain.connect(this.body);
    this.comp.connect(this.master); this.master.connect(ctx.destination);
    this.master.gain.setTargetAtTime(0.9, ctx.currentTime, 1.5);
    this.noiseBuf = this.makeNoise();
    this.buildBeds();
  }

  impulse(sec, decay) {
    const ctx = this.ctx, n = ctx.sampleRate * sec, b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay); }
    return b;
  }
  makeNoise() {
    const ctx = this.ctx, n = ctx.sampleRate * 4, b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = w * 0.5 + last * 3; }
    return b;
  }
  noise() { const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true; s.start(0, Math.random() * 3); return s; }

  panner(x, y, z, ref = 0.6) {
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = ref; p.rolloffFactor = 1.1;
    p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z;
    p.connect(this.input);
    return p;
  }

  buildBeds() {
    const ctx = this.ctx;
    // tono de la habitación
    const room = this.noise(); const rf = ctx.createBiquadFilter(); rf.type = 'lowpass'; rf.frequency.value = 220;
    const rg = ctx.createGain(); rg.gain.value = 0.05; room.connect(rf); rf.connect(rg); rg.connect(this.input);
    // exterior (ciudad lejana) entrando por la ventana
    const out = this.noise(); const of = ctx.createBiquadFilter(); of.type = 'bandpass'; of.frequency.value = 500; of.Q.value = 0.4;
    this.outsideGain = ctx.createGain(); this.outsideGain.gain.value = 0.035;
    this.windowPan = this.panner(0.3, 1.6, -2.3, 1.2);
    out.connect(of); of.connect(this.outsideGain); this.outsideGain.connect(this.windowPan);

    // zumbido de la mosca
    this.flyPan = this.panner(0, 1, 0, 0.12);
    const fo = ctx.createOscillator(); fo.type = 'sawtooth'; fo.frequency.value = 190;
    const fo2 = ctx.createOscillator(); fo2.type = 'triangle'; fo2.frequency.value = 382;
    const fl = ctx.createBiquadFilter(); fl.type = 'bandpass'; fl.frequency.value = 900; fl.Q.value = 0.7;
    this.flyGain = ctx.createGain(); this.flyGain.gain.value = 0;
    const am = ctx.createOscillator(); am.frequency.value = 23; const amg = ctx.createGain(); amg.gain.value = 0.25;
    am.connect(amg); amg.connect(this.flyGain.gain);
    fo.connect(fl); fo2.connect(fl); fl.connect(this.flyGain); this.flyGain.connect(this.flyPan);
    fo.start(); fo2.start(); am.start();
    this.flyOsc = [fo, fo2];

    // tetera: siseo que sube y burbujeo
    this.kettlePan = this.panner(2.4, 1.3, 0.48, 0.5);
    const kn = this.noise(); this.kettleFilter = ctx.createBiquadFilter(); this.kettleFilter.type = 'bandpass'; this.kettleFilter.frequency.value = 700; this.kettleFilter.Q.value = 1.2;
    this.kettleGain = ctx.createGain(); this.kettleGain.gain.value = 0;
    kn.connect(this.kettleFilter); this.kettleFilter.connect(this.kettleGain); this.kettleGain.connect(this.kettlePan);
    const bub = this.noise(); const bf = ctx.createBiquadFilter(); bf.type = 'lowpass'; bf.frequency.value = 300;
    this.boilGain = ctx.createGain(); this.boilGain.gain.value = 0;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 9; const lg = ctx.createGain(); lg.gain.value = 0.5; lfo.connect(lg); lg.connect(this.boilGain.gain); lfo.start();
    bub.connect(bf); bf.connect(this.boilGain); this.boilGain.connect(this.kettlePan);

    // zumbido eléctrico de la bombilla
    this.lampPan = this.panner(-0.05, 2.2, -0.28, 0.3);
    const hum = ctx.createOscillator(); hum.type = 'sine'; hum.frequency.value = 100;
    const hum2 = ctx.createOscillator(); hum2.type = 'sine'; hum2.frequency.value = 50;
    this.humGain = ctx.createGain(); this.humGain.gain.value = 0;
    hum.connect(this.humGain); hum2.connect(this.humGain); this.humGain.connect(this.lampPan); hum.start(); hum2.start();

    this.clockPan = this.panner(-2.74, 2.02, -0.55, 0.5);
    this.trapPan = this.panner(1.55, 0.02, 1.05, 0.4);
    this.cupPan = this.panner(0.34, 0.8, 0.02, 0.4);
    this.ratPan = this.panner(0, 0.03, 0, 0.25);
    this.stepPan = this.panner(0, 0.05, 0, 0.8);
  }

  // ---------------- eventos ----------------
  click(pan, freq = 3200, gain = 0.25, dur = 0.03) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const s = this.noise(); const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 4;
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(pan); s.stop(t + dur + 0.05);
  }
  tick(strong) { this.click(this.clockPan, strong ? 2400 : 3400, strong ? 0.35 : 0.22, 0.025); }
  thump(x, z, gain = 0.5) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    this.stepPan.positionX.value = x; this.stepPan.positionZ.value = z;
    const o = ctx.createOscillator(); o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(g); g.connect(this.stepPan); o.start(t); o.stop(t + 0.2);
    this.click(this.stepPan, 900, gain * 0.25, 0.05);
  }
  snap() {
    if (!this.ctx) return;
    this.click(this.trapPan, 1800, 0.9, 0.08); this.click(this.trapPan, 600, 0.7, 0.12);
  }
  squeak() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(3200, t); o.frequency.linearRampToValueAtTime(4100, t + 0.05); o.frequency.linearRampToValueAtTime(3000, t + 0.14);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.12, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g); g.connect(this.ratPan); o.start(t); o.stop(t + 0.2);
  }
  rattle() {
    if (!this.ctx) return;
    for (let i = 0; i < 7; i++) setTimeout(() => this.click(this.cupPan, 5200 + Math.random() * 2000, 0.18, 0.02), i * 38 + Math.random() * 20);
  }
  pour(on) { if (!this.ctx) return; if (!this.pourNode && on) {
    const ctx = this.ctx; const n = this.noise(); const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 2;
    const g = ctx.createGain(); g.gain.value = 0; n.connect(f); f.connect(g); g.connect(this.cupPan);
    const l = ctx.createOscillator(); l.frequency.value = 13; const lg = ctx.createGain(); lg.gain.value = 600; l.connect(lg); lg.connect(f.frequency); l.start();
    this.pourNode = { g };
  } if (this.pourNode) this.pourNode.g.gain.setTargetAtTime(on ? 0.25 : 0, this.ctx.currentTime, 0.1); }
  tone(freq, dur = 1.6, gain = 0.15, pan = this.input) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.frequency.value = freq;
    const o2 = ctx.createOscillator(); o2.frequency.value = freq * 2.01;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.15); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const g2 = ctx.createGain(); g2.gain.value = 0.25;
    o.connect(g); o2.connect(g2); g2.connect(g); g.connect(pan); o.start(t); o2.start(t); o.stop(t + dur); o2.stop(t + dur);
  }
  chirp() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + Math.random() * 0.2;
    const n = 2 + Math.floor(Math.random() * 4), base = 2800 + Math.random() * 2200;
    for (let i = 0; i < n; i++) {
      const s = t + i * (0.09 + Math.random() * 0.05);
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(base, s); o.frequency.exponentialRampToValueAtTime(base * (1.2 + Math.random() * 0.5), s + 0.05); o.frequency.exponentialRampToValueAtTime(base * 0.8, s + 0.08);
      const g = ctx.createGain(); g.gain.setValueAtTime(0, s); g.gain.linearRampToValueAtTime(0.05, s + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, s + 0.09);
      o.connect(g); g.connect(this.windowPan); o.start(s); o.stop(s + 0.1);
    }
  }
  whoosh() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const n = this.noise(); const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.5;
    f.frequency.setValueAtTime(200, t); f.frequency.exponentialRampToValueAtTime(3000, t + 0.5); f.frequency.exponentialRampToValueAtTime(300, t + 1.1);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.35, t + 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
    n.connect(f); f.connect(g); g.connect(this.master); n.stop(t + 1.3);
  }

  // ---------------- cada frame ----------------
  setListener(cam) {
    if (!this.ctx) return;
    const l = this.ctx.listener, p = cam.position;
    const f = cam.getWorldDirection(this._f || (this._f = cam.position.clone()));
    const u = cam.up;
    if (l.positionX) {
      const t = this.ctx.currentTime;
      l.positionX.setTargetAtTime(p.x, t, 0.02); l.positionY.setTargetAtTime(p.y, t, 0.02); l.positionZ.setTargetAtTime(p.z, t, 0.02);
      l.forwardX.setTargetAtTime(f.x, t, 0.02); l.forwardY.setTargetAtTime(f.y, t, 0.02); l.forwardZ.setTargetAtTime(f.z, t, 0.02);
      l.upX.value = u.x; l.upY.value = u.y; l.upZ.value = u.z;
    }
  }

  /** filtro del cuerpo: cómo suena el mundo desde dentro de esta cosa */
  setBody({ lowpass = 18000, peak = 1000, peakGain = 0, lowGain = 0, verb = 0.18, rate = 1 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.body.frequency.setTargetAtTime(lowpass, t, 0.3);
    this.tone.frequency.setTargetAtTime(peak, t, 0.3); this.tone.gain.setTargetAtTime(peakGain, t, 0.3);
    this.low.gain.setTargetAtTime(lowGain, t, 0.3);
    this.verbGain.gain.setTargetAtTime(verb, t, 0.3);
    this.rate = rate;
  }

  update(s, { flyPos, flyFlying, flySpeed = 0, ratPos, timeScale = 1, isFly = false }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.flyPan.positionX.value = flyPos.x; this.flyPan.positionY.value = flyPos.y; this.flyPan.positionZ.value = flyPos.z;
    this.ratPan.positionX.value = ratPos.x; this.ratPan.positionZ.value = ratPos.z;
    // en el tiempo lento de la mosca, todo suena más grave (salvo ella misma)
    const pitch = isFly ? 1 : Math.min(Math.max(timeScale, 0.25), 1.8);
    this.flyOsc[0].frequency.setTargetAtTime((185 + flySpeed * 60) * pitch, t, 0.05);
    this.flyOsc[1].frequency.setTargetAtTime((372 + flySpeed * 110) * pitch, t, 0.05);
    this.flyGain.gain.setTargetAtTime(flyFlying ? (isFly ? 0.07 : 0.16) : 0, t, 0.08);
    const k = Math.max(0, (s.kettleTemp - 40) / 60);
    this.kettleGain.gain.setTargetAtTime(s.kettleOn ? 0.05 + k * 0.2 : (s.kettleTemp > 90 ? 0.04 : 0), t, 0.3);
    this.kettleFilter.frequency.setTargetAtTime((600 + k * 2800) * pitch, t, 0.3);
    this.boilGain.gain.setTargetAtTime(s.kettleOn && k > 0.75 ? 0.35 : 0, t, 0.4);
    this.humGain.gain.setTargetAtTime(s.lampOn ? 0.012 : 0, t, 0.05);
    this.pour(s.pouring);
    if (Math.random() < 0.006 * Math.min(timeScale, 3)) this.chirp();
  }
}
