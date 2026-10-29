/** 键盘 + 鼠标输入。pressed() 只在按下的那一帧返回 true */
export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.once = new Set();
    this.dx = 0; this.dy = 0;
    this.locked = false;
    this.lastMouseT = 0;
    this.dragging = false;

    addEventListener('keydown', (e) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
      if (!e.repeat) this.once.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    canvas.addEventListener('mousedown', () => { this.dragging = true; });
    addEventListener('mouseup', () => { this.dragging = false; });
    addEventListener('mousemove', (e) => {
      // 指针锁定时直接用 movement；锁定不可用（如被 iframe 限制）时，按住左键拖拽环顾
      if (this.locked || this.dragging) {
        this.dx += e.movementX; this.dy += e.movementY;
        this.lastMouseT = performance.now();
      }
    });
  }
  down(code) { return this.keys.has(code); }
  pressed(code) { return this.once.has(code); }
  axis(neg, pos) { return (this.down(pos) ? 1 : 0) - (this.down(neg) ? 1 : 0); }
  consumeMouse() { const r = { dx: this.dx, dy: this.dy }; this.dx = this.dy = 0; return r; }
  endFrame() { this.once.clear(); }
}
