import { P } from './config.js';

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.root = $('hud');
    this.money = $('money'); this.mTitle = $('missionTitle'); this.mText = $('missionText'); this.mDist = $('missionDist');
    this.speed = $('speed'); this.prompt = $('prompt'); this.toastEl = $('toast'); this.fps = $('fps');
    this.map = $('minimap'); this.mctx = this.map.getContext('2d');
    this._toastT = 0; this._frames = 0; this._fpsT = 0;
  }

  show(v) { this.root.classList.toggle('hidden', !v); }

  toast(text, ms = 2200) {
    this.toastEl.textContent = text; this.toastEl.classList.remove('hidden');
    clearTimeout(this._toastT); this._toastT = setTimeout(() => this.toastEl.classList.add('hidden'), ms);
  }

  setPrompt(text) {
    if (text) { this.prompt.textContent = text; this.prompt.classList.remove('hidden'); }
    else this.prompt.classList.add('hidden');
  }

  frame(dt, state) {
    this.money.textContent = `$ ${state.money.toLocaleString()}`;
    this.mTitle.textContent = state.mission.title;
    this.mText.textContent = state.mission.text;
    this.mDist.textContent = state.mission.dist > 0 ? `距离目标 ${Math.round(state.mission.dist)} m` : '';
    this.speed.textContent = Math.round(Math.abs(state.kmh));
    this._frames++; this._fpsT += dt;
    if (this._fpsT > 0.5) { this.fps.textContent = `${Math.round(this._frames / this._fpsT)} FPS · 区块 ${state.chunks} · 交通 ${state.traffic}`; this._frames = 0; this._fpsT = 0; }
    this.drawMinimap(state);
  }

  /** 朝向向上的圆形小地图：道路、任务目标、交通车辆 */
  drawMinimap({ px, pz, yaw, target, trafficPts }) {
    const c = this.mctx, W = this.map.width, cx = W / 2, cy = W / 2, R = W / 2, scale = 0.55;
    const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -fz, rz = fx;
    const tr = (x, z) => { const dx = x - px, dz = z - pz; return [cx + (dx * rx + dz * rz) * scale, cy - (dx * fx + dz * fz) * scale]; };

    c.save();
    c.clearRect(0, 0, W, W);
    c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.clip();
    c.fillStyle = '#27303a'; c.fillRect(0, 0, W, W);

    const span = R / scale + 20;
    c.strokeStyle = '#5d6772'; c.lineWidth = 16 * scale; c.lineCap = 'butt';
    for (let I = Math.floor((px - span) / P); I <= Math.ceil((px + span) / P); I++) {
      const a = tr(I * P, pz - span), b = tr(I * P, pz + span);
      c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke();
    }
    for (let J = Math.floor((pz - span) / P); J <= Math.ceil((pz + span) / P); J++) {
      const a = tr(px - span, J * P), b = tr(px + span, J * P);
      c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke();
    }

    c.fillStyle = '#e05a5a';
    for (const [x, z] of trafficPts) { const [mx, my] = tr(x, z); c.fillRect(mx - 1.5, my - 1.5, 3, 3); }

    if (target) {
      let [mx, my] = tr(target.x, target.z);
      const dx = mx - cx, dy = my - cy, d = Math.hypot(dx, dy), lim = R - 10;
      const edge = d > lim;
      if (edge) { mx = cx + dx / d * lim; my = cy + dy / d * lim; }
      c.fillStyle = '#ffcf3f'; c.strokeStyle = '#1a1405'; c.lineWidth = 2;
      c.beginPath(); c.arc(mx, my, edge ? 5 : Math.max(6, target.r * scale), 0, Math.PI * 2); c.fill(); c.stroke();
    }

    // 玩家箭头
    c.translate(cx, cy);
    c.fillStyle = '#ffffff'; c.strokeStyle = '#0b0f14'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(0, -9); c.lineTo(6, 7); c.lineTo(0, 3); c.lineTo(-6, 7); c.closePath(); c.fill(); c.stroke();
    c.restore();
  }
}
