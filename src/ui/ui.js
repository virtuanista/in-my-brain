const $ = (id) => document.getElementById(id);

/**
 * Interfaz: HUD + mazo de cartas para elegir mente.
 * El mazo enseña una carta grande; la anterior y la siguiente asoman detrás.
 * Se arrastra, o se usa ← →; Enter o clic en la carta central para entrar.
 */
export class UI {
  constructor(minds, onPick) {
    this.minds = minds;
    this.onPick = onPick;
    this.thumbs = {};
    this.current = null;
    this.idx = 0;
    this.pos = 0; // posición continua (para el arrastre)
    this.thoughtTimer = null;
    this.labelEls = new Map();
    this.cards = [];
    this.canClose = false;

    $('openPicker').addEventListener('click', () => this.openPicker());
    $('deckBack').addEventListener('click', () => this.closePicker(true));
    $('deckPrev').addEventListener('click', () => this.go(this.idx - 1));
    $('deckNext').addEventListener('click', () => this.go(this.idx + 1));
    const stage = $('deckStage');
    let drag = null;
    stage.addEventListener('pointerdown', (e) => {
      drag = { x: e.clientX, start: this.pos, moved: false };
      stage.setPointerCapture(e.pointerId);
    });
    stage.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      if (Math.abs(dx) > 6) drag.moved = true;
      this.pos = drag.start - dx / Math.min(380, innerWidth * 0.45);
      this.layout(true);
    });
    stage.addEventListener('pointerup', (e) => {
      if (!drag) return;
      const moved = drag.moved;
      drag = null;
      if (moved) { this.go(Math.round(this.pos)); return; }
      // clic sin arrastre: la central entra; una lateral pasa a ser la central
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.card');
      if (!el) { this.layout(); return; }
      const d = this.shortest(Number(el.dataset.i) - this.wrap(this.idx));
      if (d === 0) this.pick(); else this.go(this.idx + d);
    });
    stage.addEventListener('pointercancel', () => { drag = null; this.go(this.idx); });
    addEventListener('wheel', (e) => {
      if (!this.pickerOpen) return;
      const now = performance.now();
      if (now - (this.lastWheel || 0) < 180) return;
      this.lastWheel = now;
      this.go(this.idx + Math.sign(e.deltaY || e.deltaX));
    }, { passive: true });
    addEventListener('keydown', (e) => {
      if (!this.pickerOpen) return;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') this.go(this.idx + 1);
      else if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.go(this.idx - 1);
      else if (e.code === 'Enter' || e.code === 'Space') this.pick();
      else if ((e.code === 'Escape' || e.code === 'Tab') && this.canClose) { e.preventDefault(); this.closePicker(true); }
    });
  }

  get pickerOpen() { return !$('picker').hidden; }
  wrap(i) { const n = this.minds.length; return ((i % n) + n) % n; }
  shortest(d) { const n = this.minds.length; d = ((d % n) + n) % n; return d > n / 2 ? d - n : d; }

  build() {
    const stage = $('deckStage');
    stage.innerHTML = '';
    this.cards = this.minds.map((m, i) => {
      const c = document.createElement('div');
      c.className = 'card';
      c.dataset.i = i;
      c.innerHTML = `
        <div class="card-img"><img alt="" draggable="false" src="${this.thumbs[m.id] || ''}" /></div>
        <div class="meta">
          <div class="name">${m.name}</div>
          <div class="sense">${m.sense}</div>
        </div>`;
      stage.appendChild(c);
      return c;
    });
  }

  openPicker(first = false, startId = null) {
    if (!this.cards.length) this.build();
    this.canClose = !first && !!this.current;
    if (startId) { const i = this.minds.findIndex((m) => m.id === startId); if (i >= 0) { this.idx = i; this.pos = i; } }
    $('picker').hidden = false;
    $('deckBack').hidden = !this.canClose;
    document.body.classList.add('browsing');
    this.layout();
    this.onOpen?.(this.wrap(this.idx));
  }
  closePicker(cancel = false) {
    this.closedAt = performance.now();
    $('picker').hidden = true;
    document.body.classList.remove('browsing');
    this.onClose?.(cancel);
  }

  go(i) {
    this.idx = i; this.pos = i;
    this.layout();
    this.onIndex?.(this.wrap(i));
  }
  pick() { const m = this.minds[this.wrap(this.idx)]; this.closePicker(); this.onPick(m.id); }

  layout(dragging = false) {
    const n = this.minds.length;
    $('deckCount').textContent = `${this.wrap(Math.round(this.pos)) + 1} / ${n}`;
    this.cards.forEach((c, i) => {
      let off = i - this.pos;
      off = ((((off + n / 2) % n) + n) % n) - n / 2; // camino más corto alrededor
      const a = Math.abs(off);
      c.style.transition = dragging ? 'none' : '';
      if (a > 2.5) { c.style.opacity = '0'; c.style.pointerEvents = 'none'; c.style.transform = `translate(-50%,-50%) translateX(${Math.sign(off) * 90}%) scale(.55)`; return; }
      const x = Math.sign(off) * (a < 1 ? a * 64 : 64 + (a - 1) * 34);
      const s = 1 - Math.min(a, 2.5) * 0.13;
      c.style.transform = `translate(-50%,-50%) translateX(${x}%) translateY(${a * 2.5}%) rotate(${off * 3.5}deg) scale(${s})`;
      c.style.opacity = String(Math.max(0, 1 - a * 0.36));
      c.style.zIndex = String(100 - Math.round(a * 10));
      c.style.filter = a > 0.5 ? `brightness(${1 - Math.min(a, 2) * 0.3})` : 'none';
      c.style.pointerEvents = a < 1.6 ? 'auto' : 'none';
      c.classList.toggle('front', a < 0.5);
    });
  }

  setMind(m, kicker) {
    $('thought').classList.remove('on');
    this.current = m?.id ?? null;
    $('hudKicker').textContent = kicker;
    $('hudName').textContent = m ? m.name : '';
    const list = [...(m?.controls ?? []), ['Tab', 'cambiar']];
    $('controls').innerHTML = list.map(([k, v]) => `<span><kbd>${k}</kbd> ${v}</span>`).join('');
  }

  setClock(str, scale) {
    $('hudTime').textContent = str;
    const s = scale === 0 ? 'tiempo detenido' : scale < 0 ? `rebobinando ×${Math.abs(scale).toLocaleString('es', { maximumFractionDigits: 1 })}` : `tiempo ×${scale.toLocaleString('es', { maximumFractionDigits: 2 })}`;
    $('hudScale').textContent = s;
  }

  thought(text) {
    const el = $('thought');
    el.classList.remove('on');
    clearTimeout(this.thoughtTimer);
    setTimeout(() => {
      el.textContent = text;
      el.classList.add('on');
      this.thoughtTimer = setTimeout(() => el.classList.remove('on'), 5000 + text.length * 40);
    }, el.textContent ? 650 : 0);
  }

  prompt(text) { const p = $('prompt'); p.hidden = !text; if (text) p.innerHTML = text; }
  meter(label, v) { const m = $('meter'); m.hidden = label == null; if (label != null) { $('meterLabel').textContent = label; $('meterFill').style.width = `${Math.round(v * 100)}%`; } }
  crosshair(on) { $('crosshair').classList.toggle('on', !!on); }
  fade(on) { $('fade').classList.toggle('on', on); }

  /** etiquetas proyectadas: la mente humana nombra el mundo */
  labels(items) {
    const root = $('labels');
    const seen = new Set();
    for (const it of items) {
      let el = this.labelEls.get(it.key);
      if (!el) { el = document.createElement('div'); el.className = 'lbl'; root.appendChild(el); this.labelEls.set(it.key, el); }
      if (el.textContent !== it.text) el.textContent = it.text;
      el.style.left = `${it.x}px`; el.style.top = `${it.y}px`;
      el.style.opacity = it.a.toFixed(2);
      el.style.fontSize = `${it.size}px`;
      seen.add(it.key);
    }
    for (const [k, el] of this.labelEls) if (!seen.has(k)) el.style.opacity = '0';
  }
}
