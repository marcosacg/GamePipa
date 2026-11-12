// Sons gerados na hora (sem arquivos): vento, linha vibrando e efeitos
export const Snd = {
  ctx: null,
  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    try {
      const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; last = (last + .02 * w) / 1.02; d[i] = last * 3.5; }
      const mk = (type, f, q) => {
        const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true;
        const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
        const g = ctx.createGain(); g.gain.value = 0;
        s.connect(fl).connect(g).connect(ctx.destination); s.start();
        return g;
      };
      this.wind = mk('lowpass', 420, .7);
      this.flutter = mk('bandpass', 900, 3);
    } catch (e) { this.ctx = null; }
  },
  update(paused, windSpeed, apparent, flying, tension) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.wind.gain.setTargetAtTime(paused ? 0 : .05 + windSpeed * .018, t, .3);
    this.flutter.gain.setTargetAtTime(paused || !flying ? 0 : Math.min(.12, apparent * .012) * (tension > .5 ? 1 : .3), t, .15);
  },
  beep(f, d, type = 'sine', vol = .12) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + d);
    o.connect(g).connect(this.ctx.destination); o.start(t); o.stop(t + d + .02);
  },
  ring(m = 1) { this.beep(880 * m, .18, 'triangle'); setTimeout(() => this.beep(1320 * m, .22, 'triangle'), 90); },
  win() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.beep(f, .25, 'triangle', .14), i * 120)); },
  fail() { this.beep(220, .3, 'sawtooth', .07); setTimeout(() => this.beep(150, .4, 'sawtooth', .07), 140); },
  tangle() { this.beep(330, .12, 'square', .07); setTimeout(() => this.beep(300, .12, 'square', .07), 120); },
};
