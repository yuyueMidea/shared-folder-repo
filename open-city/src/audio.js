/** 极简 WebAudio：引擎声（锯齿波 + 低通）与碰撞噪声。必须在用户手势之后 start() */
export class GameAudio {
  constructor() { this.ctx = null; }

  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = 0.35; this.master.connect(ctx.destination);

    this.osc1 = ctx.createOscillator(); this.osc1.type = 'sawtooth';
    this.osc2 = ctx.createOscillator(); this.osc2.type = 'square';
    this.filter = ctx.createBiquadFilter(); this.filter.type = 'lowpass'; this.filter.frequency.value = 400;
    this.engineGain = ctx.createGain(); this.engineGain.gain.value = 0;
    this.osc1.connect(this.filter); this.osc2.connect(this.filter);
    this.filter.connect(this.engineGain); this.engineGain.connect(this.master);
    this.osc1.start(); this.osc2.start();

    const len = ctx.sampleRate * 0.6;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  }

  /** speed: m/s 绝对值；throttle: 0..1；active: 是否在驾驶 */
  engine(active, speed, throttle) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const f = 48 + speed * 3.6 + throttle * 18;
    this.osc1.frequency.setTargetAtTime(f, t, 0.05);
    this.osc2.frequency.setTargetAtTime(f * 0.5, t, 0.05);
    this.filter.frequency.setTargetAtTime(260 + speed * 22 + throttle * 300, t, 0.08);
    this.engineGain.gain.setTargetAtTime(active ? 0.10 + throttle * 0.07 : 0, t, 0.12);
  }

  crash(intensity = 1) {
    if (!this.ctx) return;
    const src = this.ctx.createBufferSource(); src.buffer = this.noise;
    const g = this.ctx.createGain(); g.gain.value = Math.min(1, 0.25 + intensity * 0.12);
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
    src.connect(f); f.connect(g); g.connect(this.master); src.start();
  }
}

// 任务完成提示音
GameAudio.prototype.chime = function () {
  if (!this.ctx) return;
  const t = this.ctx.currentTime;
  [660, 880, 1320].forEach((f, k) => {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0, t + k * 0.11);
    g.gain.linearRampToValueAtTime(0.25, t + k * 0.11 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + k * 0.11 + 0.5);
    o.connect(g); g.connect(this.master); o.start(t + k * 0.11); o.stop(t + k * 0.11 + 0.55);
  });
};
