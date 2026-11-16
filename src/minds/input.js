/** Entrada: teclado, ratón con pointer lock, rueda. */
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.dx = 0; this.dy = 0; this.wheel = 0;
    this.locked = false;
    this.mouse = { x: 0, y: 0, down: false, right: false, nx: 0.5, ny: 0.5 };
    this.wantLock = false;
    addEventListener('keydown', (e) => {
      if (e.target && e.target.tagName === 'INPUT') return;
      if (e.code === 'Tab') e.preventDefault();
      if (e.code === 'Space') e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    addEventListener('mousemove', (e) => {
      if (this.locked) { this.dx += e.movementX; this.dy += e.movementY; }
      this.mouse.x = e.clientX; this.mouse.y = e.clientY;
      this.mouse.nx = e.clientX / innerWidth; this.mouse.ny = e.clientY / innerHeight;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) { this.mouse.down = true; this.pressed.add('Mouse0'); }
      if (e.button === 2) this.mouse.right = true;
      if (this.wantLock && !this.locked) try { canvas.requestPointerLock?.()?.catch?.(() => {}); } catch (e) {}
    });
    addEventListener('mouseup', (e) => { if (e.button === 0) this.mouse.down = false; if (e.button === 2) this.mouse.right = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === canvas; });
  }
  down(c) { return this.keys.has(c); }
  hit(c) { return this.pressed.has(c); }
  lock() { this.wantLock = true; }
  unlock() { this.wantLock = false; if (document.pointerLockElement) document.exitPointerLock(); }
  endFrame() { this.pressed.clear(); this.dx = 0; this.dy = 0; this.wheel = 0; }
}
