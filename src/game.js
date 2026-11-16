import * as THREE from 'three';
import { MINDS } from './minds/registry.js';
import { Input } from './minds/input.js';
import { UI } from './ui/ui.js';
import { Audio } from './audio/audio.js';
import { Thermal } from './fx/thermal.js';
import { MODE } from './fx/perception.js';
import { buildAtmosphere } from './fx/atmosphere.js';
import { buildFly, animateRat, buildHuman, buildSteam, buildScent, buildCrumbs } from './world/actors.js';
import { LOOP, stateAt, flyAt, clockString, HOLE, smooth } from './world/timeline.js';
import { ROOM, WINDOW, DOOR, SUN_DIR } from './world/room.js';
import { surfaceAt } from './world/kitchen.js';

const V = () => new THREE.Vector3();
const tmp = V(), tmp2 = V(), tmp3 = V();
const clamp = THREE.MathUtils.clamp, damp = THREE.MathUtils.damp, lerp = THREE.MathUtils.lerp;
const euler = new THREE.Euler(0, 0, 0, 'YXZ');

function angleDamp(a, b, l, dt) {
  let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return a + d * (1 - Math.exp(-l * dt));
}

export class Game {
  constructor(engine, room, kitchen) {
    this.engine = engine; this.scene = engine.scene; this.cam = engine.camera;
    this.room = room; this.k = kitchen; this.E = kitchen.E;
    this.minds = MINDS;
    this.mindById = Object.fromEntries(MINDS.map((m) => [m.id, m]));
    this.t = 44; // segundos de la mañana (empieza con todos en escena)
    this.wt = 0; // tiempo del mundo (para animaciones), avanza con la escala de la mente
    this.rt = 0; // tiempo real
    this.ov = {}; // cambios provocados por el jugador
    this.mind = null;
    this.ctl = {};
    this.started = false;
    this.input = new Input(engine.renderer.domElement);
    this.audio = new Audio();
    this.thermal = new Thermal(this.scene);
    this.ui = new UI(MINDS, (id) => this.possess(id));
    // el mazo de cartas: al abrirlo sales del cuerpo y la cámara va enseñando cada cosa
    this.ui.onOpen = (i) => {
      this.prevMind = this.mind?.id ?? null;
      if (this.mind) this.leaveMind();
      this.setBrowse(i);
    };
    this.ui.onIndex = (i) => this.browseTo(i);
    this.ui.onClose = (cancel) => { if (cancel && this.prevMind) { const id = this.prevMind; this.mind = null; this.enterMind(id); this.trans = 0.5; } };
    this.lastStep = 0; this.lastSec = -1;
    this.thoughtState = { text: null, at: -99, idleAt: 0, idleIdx: 0 };
    this.trans = 0;
  }

  async init() {
    const { scene, E } = this;
    const pickables = (this.pickables = []);

    // ---------- humano (sombra)
    this.human = await buildHuman();
    scene.add(this.human.root);
    this.thermal.setTemp(this.human.root, 35.5);
    this.human.meshes.forEach((m) => (m.userData.thermalVisible = true));
    const proxyMat = new THREE.MeshBasicMaterial({ visible: false });
    const hProxy = new THREE.Mesh(new THREE.CapsuleGeometry(0.25, 1.2, 4, 8), proxyMat);
    hProxy.position.y = 0.85; hProxy.userData.mind = 'human'; hProxy.userData.noThermal = true;
    this.human.root.add(hProxy); pickables.push(hProxy);

    // ---------- mosca
    this.fly = buildFly();
    scene.add(this.fly);
    this.thermal.setTemp(this.fly, 27);
    const fProxy = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), proxyMat);
    fProxy.userData.mind = 'fly'; fProxy.userData.noThermal = true; this.fly.add(fProxy); pickables.push(fProxy);
    this.flyState = { pos: V(), vel: V(), landed: false, yaw: 0, normal: new THREE.Vector3(0, 1, 0) };

    // ---------- rata
    const ratModel = this.k.models.street_rat.clone(true);
    ratModel.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.rat = new THREE.Group(); this.rat.add(ratModel); ratModel.scale.setScalar(2.1);
    scene.add(this.rat);
    this.ratU = animateRat(ratModel);
    this.thermal.setTemp(this.rat, 37);
    const rProxy = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.3), proxyMat);
    rProxy.position.y = 0.04; rProxy.userData.mind = 'rat'; rProxy.userData.noThermal = true; this.rat.add(rProxy); pickables.push(rProxy);
    this.ratYaw = 0;

    // ---------- té, vapor, migas, olor
    const cupBox = new THREE.Box3().setFromObject(E.cup);
    this.cupBox = cupBox;
    this.cupCenter = cupBox.getCenter(V());
    const cupH = cupBox.max.y - cupBox.min.y, cupR = Math.min(cupBox.max.x - cupBox.min.x, cupBox.max.z - cupBox.min.z) / 2;
    this.teaMat = new THREE.MeshPhysicalMaterial({ color: 0x4a1d05, roughness: 0.04, metalness: 0, clearcoat: 1, envMapIntensity: 1.4 });
    this.tea = new THREE.Mesh(new THREE.CircleGeometry(cupR * 0.86, 40), this.teaMat);
    this.tea.rotation.x = -Math.PI / 2;
    this.tea.userData = { y0: cupBox.min.y + cupH * 0.18, y1: cupBox.min.y + cupH * 0.8, r: cupR };
    scene.add(this.tea);
    this.thermal.setTemp(this.tea, () => this.s?.cupTemp ?? 20);
    this.thermal.setTemp(E.cup, () => 20 + Math.max(0, (this.s?.cupTemp ?? 20) - 20) * 0.75);
    this.thermal.setTemp(E.saucer, () => 20 + Math.max(0, (this.s?.cupTemp ?? 20) - 20) * 0.25);
    this.thermal.setTemp(E.kettle, () => this.s?.kettleTemp ?? 19);
    this.thermal.setTemp(this.room.group, 17.5);
    this.thermal.setTemp(this.room.glass, 11);
    this.room.glass.userData.thermalVisible = true;
    this.glassOrigOpacity = 1;

    this.streamMat = new THREE.MeshPhysicalMaterial({ color: 0x7a3a0c, roughness: 0.05, transparent: true, opacity: 0.85, clearcoat: 1 });
    this.stream = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0045, 1, 10, 1, true), this.streamMat);
    this.stream.visible = false; scene.add(this.stream);
    this.thermal.setTemp(this.stream, 95);

    this.kettleHome = { pos: E.kettle.position.clone(), quat: E.kettle.quaternion.clone() };
    const kb = new THREE.Box3().setFromObject(E.kettle);
    this.kettleBox = kb;
    this.steamK = buildSteam(80, 1.2); scene.add(this.steamK);
    this.steamC = buildSteam(50, 0.7); scene.add(this.steamC);
    this.steamC.position.set(this.cupCenter.x, cupBox.max.y, this.cupCenter.z);

    this.croissantHome = { pos: E.croissant.position.clone(), quat: E.croissant.quaternion.clone() };
    this.crumbsFloor = buildCrumbs(46, new THREE.Vector3(-0.06, 0, 0.66), 0.16, 0);
    this.crumbsPlate = buildCrumbs(22, new THREE.Vector3(-0.08, 0, 0.06), 0.06, this.k.top + 0.01);
    scene.add(this.crumbsFloor, this.crumbsPlate);
    this.scent = buildScent([E.croissant.position.clone().setY(this.k.top + 0.05), new THREE.Vector3(-0.06, 0.01, 0.66), E.apple.position.clone(), new THREE.Vector3(1.55, 0.02, 1.05)]);
    scene.add(this.scent);
    this.scent.userData.noThermal = true;

    // ---------- lámpara
    this.lampLight = new THREE.PointLight(0xffc27a, 0, 9, 1.6);
    this.lampLight.position.copy(this.k.bulbPos);
    this.lampLight.castShadow = true;
    this.lampLight.shadow.mapSize.set(512, 512);
    this.lampLight.shadow.bias = -0.002;
    scene.add(this.lampLight);
    this.bulbMat = new THREE.MeshStandardMaterial({ color: 0x2a2520, emissive: new THREE.Color(0xffb15a), emissiveIntensity: 0, roughness: 0.2 });
    this.bulb = new THREE.Mesh(new THREE.SphereGeometry(0.03, 24, 16), this.bulbMat);
    this.bulb.position.copy(this.k.bulbPos);
    this.bulb.scale.set(1, 1.25, 1);
    scene.add(this.bulb);
    this.thermal.setTemp(this.bulb, () => (this.s?.lampOn ? 95 : 24));
    this.thermal.setTemp(E.lamp, () => (this.s?.lampOn ? 40 : 20));

    // ---------- atmósfera
    this.atmo = buildAtmosphere(scene, { sunDir: SUN_DIR, win: WINDOW, winZ: ROOM.z0 - 0.1, room: ROOM });
    this.atmo.dust.userData.noThermal = true;
    const pu = this.engine.perception.uniforms;
    pu.uSunDir.value.copy(SUN_DIR); pu.uWin.value.set(WINDOW.cx, WINDOW.y0, WINDOW.y1, WINDOW.w / 2); pu.uWinZ.value = ROOM.z0 - 0.1;
    Object.assign(this.thermal.uniformsShared, { uSunDir: { value: SUN_DIR.clone() }, uWin: { value: pu.uWin.value.clone() }, uWinZ: { value: ROOM.z0 - 0.1 } });

    // ---------- vaho del cristal
    this.fogCanvas = document.getElementById('fogCanvas');
    this.fogCtx = this.fogCanvas.getContext('2d');
    this.fogCtx.fillStyle = '#fff'; this.fogCtx.fillRect(0, 0, 512, 512);
    this.fogTex = new THREE.CanvasTexture(this.fogCanvas);
    pu.tFog.value = this.fogTex;

    // ---------- relación malla -> mente para el ratón
    const entityObj = this.entityObjects();
    for (const m of MINDS) {
      const o = entityObj[m.entity];
      if (!o || ['human', 'fly', 'rat', 'dust'].includes(m.entity)) continue;
      o.traverse((c) => { if (c.isMesh) { c.userData.mind = m.id; pickables.push(c); } });
    }
    this.room.glass.userData.mind = 'glass';

    // ---------- obstáculos para caminar (cajas en XZ)
    const boxOf = (o, pad = 0.02) => { const b = new THREE.Box3().setFromObject(o); return [b.min.x - pad, b.min.z - pad, b.max.x + pad, b.max.z + pad]; };
    const big = [E.cabinet, E.stove, E.shelves, E.bigplant, E.stool, E.basket].map((o) => boxOf(o));
    const tb = new THREE.Box3().setFromObject(E.table);
    this.obstaclesRat = big;
    this.obstaclesHuman = [...big, [tb.min.x, tb.min.z, tb.max.x, tb.max.z], ...E.chairs.map((c) => boxOf(c, 0.0))];
    this.flyColliders = [...this.room.colliders];
    [E.table, E.cup, E.saucer, E.croissant, E.plate, E.teapot, E.kettle, E.lamp, E.bowl, E.chairs[0], E.chairs[1], E.chairs[2], E.chairs[3], E.plant, E.cactus, E.bigplant].forEach((o) => o.traverse((c) => { if (c.isMesh) this.flyColliders.push(c); }));

    this.clockHands = {
      h: E.clock.getObjectByName('wall_clock_hours_hand'),
      m: E.clock.getObjectByName('wall_clock_minute_hand'),
      s: E.clock.getObjectByName('wall_clock_second_hand'),
    };

    this.s = stateAt(this.t);
    this.applyWorld(0);
    this.makeThumbs();
    this.browseIdx = 0;
    this.setBrowse(0);
    this.cam.position.set(2.25, 1.55, 2.0);
    this.raycaster = new THREE.Raycaster();
  }

  entityObjects() {
    const E = this.E;
    return {
      ...E, fly: this.fly, rat: this.rat, human: this.human.root, glass: this.room.glass, lamp: E.lamp,
      door: this.room.doorLeaf, floor: this.room.floor, switch: this.room.switchPlate, chair: E.chairs[2], dust: null,
    };
  }

  // ======================================================================= ESTADO
  computeState() {
    let s = stateAt(this.t);
    const ov = this.ov, t = this.t;
    if (this.humanFree && this.snap) {
      // si eres el humano, su guion se detiene: lo que pase lo decides tú
      const S0 = this.snap;
      const dtS = Math.max(0, t - S0.t);
      s = { ...s, human: { ...s.human, x: this.ctl.pos.x, z: this.ctl.pos.y, yaw: this.ctl.yaw, moving: this.ctl.moving, inside: this.ctl.pos.x > ROOM.x0 } };
      s.lampOn = S0.lampOn; s.door = S0.door; s.croissant = S0.croissant; s.crumbs = S0.crumbs;
      s.teaLevel = S0.teaLevel; s.pouring = false; s.carryingKettle = !!ov.carry;
      s.kettleOn = false; s.kettleTemp = S0.kettleTemp > 20 ? Math.max(20, S0.kettleTemp - dtS * 0.25) : S0.kettleTemp;
      s.cupTemp = S0.cupTemp > 20 ? Math.max(20, S0.cupTemp - dtS * 0.2) : S0.cupTemp;
      if (ov.kettleOnAt != null) {
        const k = smooth(ov.kettleOnAt, ov.kettleOnAt + 24, t);
        s.kettleTemp = lerp(Math.max(19, S0.kettleTemp), 100, k); s.kettleOn = k < 1 && !ov.carry;
      }
      if (ov.pourAt != null) {
        s.pouring = t > ov.pourAt && t < ov.pourAt + 6;
        s.teaLevel = Math.max(S0.teaLevel, smooth(ov.pourAt + 0.5, ov.pourAt + 6, t));
        s.cupTemp = Math.max(s.cupTemp, 20 + 62 * smooth(ov.pourAt, ov.pourAt + 6, t) - Math.max(0, t - ov.pourAt - 6) * 0.2);
      }
      if (ov.croissantAt != null) { s.croissant = false; s.crumbs = 1; }
    }
    if (ov.lamp != null) s.lampOn = ov.lamp;
    if (ov.trap != null) s.trapSnapped = ov.trap;
    return s;
  }

  // ======================================================================= MUNDO
  applyWorld(dt) {
    const s = this.s, E = this.E, t = this.t;
    const wt = this.wt;

    // puerta
    this.room.doorPivot.rotation.y = -1.5 * s.door;

    // sol que se desplaza muy despacio (se nota en el time-lapse)
    const sd = SUN_DIR.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), (t / LOOP - 0.5) * 0.14);
    this.room.sun.position.copy(this.room.sun.target.position).addScaledVector(sd, -9);
    this.engine.perception.uniforms.uSunDir.value.copy(sd);
    this.atmo.uniforms.uSunDir.value.copy(sd);
    this.thermal.uniformsShared.uSunDir.value.copy(sd);

    // lámpara
    const lampK = s.lampOn ? 1 : 0;
    this.lampLight.intensity = damp(this.lampLight.intensity, lampK * 5.5, 30, dt || 1);
    this.lampLight.visible = this.lampLight.intensity > 0.01;
    this.bulbMat.emissiveIntensity = this.lampLight.intensity * 9;
    if (this.lastLamp !== undefined && this.lastLamp !== s.lampOn) { this.audio.click(this.audio.lampPan, 2600, 0.3, 0.02); this.ripple(0.4); }
    this.lastLamp = s.lampOn;

    // reloj
    const secs = 7 * 3600 + 14 * 60 + t;
    const { h, m, s: sh } = this.clockHands;
    if (h) h.rotation.z = -((secs / 3600) % 12) / 12 * Math.PI * 2;
    if (m) m.rotation.z = -((secs / 60) % 60) / 60 * Math.PI * 2;
    if (sh) sh.rotation.z = -Math.floor(secs % 60) / 60 * Math.PI * 2;
    const sec = Math.floor(t);
    if (sec !== this.lastSec && this.started) { this.audio.tick(sec % 2 === 0); this.lastSec = sec; if (this.mind?.id === 'clock') this.ripple(0.2); }

    // humano
    const H = this.human;
    if (!this.humanFree) {
      H.root.position.set(s.human.x, 0, s.human.z);
      H.root.rotation.y = angleDamp(H.root.rotation.y, s.human.yaw, 6, dt || 1);
    } else {
      H.root.position.set(this.ctl.pos.x, 0, this.ctl.pos.y);
      H.root.rotation.y = this.ctl.yaw + Math.PI;
    }
    H.root.visible = s.human.inside || s.door > 0.05 || this.humanFree;
    H.update(dt, s.human.moving, 1.0);
    if (this._self !== !!this.humanFree) { this._self = !!this.humanFree; H.setSelf(this._self); }
    if (s.human.moving && s.human.inside && this.wt - this.lastStep > 0.55) {
      this.lastStep = this.wt;
      this.audio.thump(s.human.x, s.human.z, 0.5);
      this.ripple(0.35);
      this.shake = 1;
    }

    // tetera
    const K = E.kettle;
    H.root.updateMatrixWorld(true);
    if (s.carryingKettle) {
      // inclinarse para servir
      const pourK = this.humanFree ? (s.pouring ? 1 : 0) : smooth(87.5, 89.5, t) * (1 - smooth(96, 98, t));
      const c = this.cupCenter;
      const from = tmp3.set(H.root.position.x - c.x, 0, H.root.position.z - c.z).normalize();
      const pourPos = new THREE.Vector3(c.x + from.x * 0.13, this.cupBox.max.y + 0.16, c.z + from.z * 0.13);
      if (pourK > 0 && !this.humanFree) {
        // IK sencilla: el brazo derecho se estira hacia el asa de la tetera
        const arm = H.arm || (H.arm = H.root.getObjectByName('RightArm') || H.root.getObjectByName('mixamorigRightArm'));
        if (arm) {
          const a = arm.getWorldPosition(new THREE.Vector3());
          const cur = H.hand.getWorldPosition(new THREE.Vector3()).sub(a).normalize();
          const want = pourPos.clone().add(new THREE.Vector3(0, 0.1, 0)).sub(a).normalize();
          const dq = new THREE.Quaternion().slerp(new THREE.Quaternion().setFromUnitVectors(cur, want), pourK);
          const aw = arm.getWorldQuaternion(new THREE.Quaternion());
          const pw = arm.parent.getWorldQuaternion(new THREE.Quaternion());
          arm.quaternion.copy(pw.invert().multiply(dq.multiply(aw)));
          H.root.updateMatrixWorld(true);
        }
      }
      const hand = H.hand.getWorldPosition(tmp);
      const yaw = H.root.rotation.y;
      let target = tmp2.copy(hand).add(new THREE.Vector3(0, -0.2, 0));
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw - Math.PI / 2, 0));
      if (pourK > 0) {
        target.lerp(pourPos, pourK);
        const faceYaw = Math.atan2(-from.x, -from.z);
        const qp = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, faceYaw - Math.PI / 2, 0));
        const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -0.85 * pourK);
        qp.multiply(tilt);
        q.slerp(qp, pourK);
      }
      K.position.copy(target).sub(new THREE.Vector3(0, 0, 0));
      K.quaternion.copy(q);
    } else {
      K.position.copy(this.kettleHome.pos); K.quaternion.copy(this.kettleHome.quat);
    }
    K.updateMatrixWorld(true);
    // pico: el extremo de la caja en +x local
    const kb = this.kettleBox;
    const spoutLocal = this._spout || (this._spout = K.worldToLocal(new THREE.Vector3(kb.min.x + 0.01, kb.max.y - 0.07, (kb.min.z + kb.max.z) / 2)).clone());
    const spout = K.localToWorld(spoutLocal.clone());
    this.steamK.position.copy(spout);
    this.steamK.material.uniforms.uAmount.value = smooth(82, 99, s.kettleTemp) * (s.pouring ? 0.4 : 1);
    this.steamK.material.uniforms.uT.value = wt;

    // chorro de té
    if (s.pouring) {
      const top = spout.clone().add(new THREE.Vector3(0, -0.005, 0));
      const bottom = new THREE.Vector3(this.cupCenter.x, this.tea.position.y, this.cupCenter.z);
      const mid = top.clone().add(bottom).multiplyScalar(0.5);
      this.stream.position.copy(mid);
      const dir = bottom.clone().sub(top);
      this.stream.scale.set(1, dir.length(), 1);
      this.stream.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize().negate());
      this.stream.visible = true;
    } else this.stream.visible = false;
    this.tea.visible = s.teaLevel > 0.01;
    this.tea.position.set(this.cupCenter.x, lerp(this.tea.userData.y0, this.tea.userData.y1, s.teaLevel), this.cupCenter.z);
    const ts = 0.75 + s.teaLevel * 0.25; this.tea.scale.set(ts, ts, 1);
    if (this.rattle > 0) { this.tea.position.y += Math.sin(this.rt * 80) * 0.0008 * this.rattle; }
    this.steamC.material.uniforms.uAmount.value = (s.teaLevel > 0.3 ? 1 : 0) * smooth(38, 75, s.cupTemp);
    this.steamC.material.uniforms.uT.value = wt;
    this.steamC.position.y = this.cupBox.max.y - 0.01;

    // cruasán
    const C = E.croissant;
    if (!this.humanFree && t > 108.6 && t < 127) {
      const hand = H.hand.getWorldPosition(tmp);
      C.position.copy(hand).add(new THREE.Vector3(0, -0.06, 0)); C.visible = s.human.inside || s.door > 0.1;
    } else if (this.humanFree && this.ov.croissantAt != null) {
      const hand = H.hand.getWorldPosition(tmp);
      C.position.copy(hand).add(new THREE.Vector3(0, -0.06, 0)); C.visible = true;
    } else { C.position.copy(this.croissantHome.pos); C.quaternion.copy(this.croissantHome.quat); C.visible = s.croissant; }
    this.crumbsFloor.visible = s.crumbs > 0.01;
    this.crumbsFloor.count = Math.ceil(46 * s.crumbs);
    this.crumbsPlate.visible = !s.croissant || t > 108.6;

    // rata
    if (this.mind?.id !== 'rat') {
      const R = this.rat;
      R.position.set(s.rat.x, 0, s.rat.z);
      if (s.rat.moving) this.ratYaw = angleDamp(this.ratYaw, s.rat.yaw, 10, dt || 1);
      R.rotation.y = this.ratYaw;
      R.visible = s.rat.visible;
      this.ratU.uRun.value = damp(this.ratU.uRun.value, s.rat.moving ? 1 : 0, 8, dt || 1);
      this.ratU.uSniff.value = s.rat.moving ? 0 : 1;
    }
    this.ratU.uT.value = wt;

    // trampa
    if (s.trapSnapped && !this.lastTrap) { this.audio.snap(); this.ripple(1); this.trapJump = 1; if (this.mind?.id === 'rat' || (this.rat.position.distanceTo(E.trap.position) < 0.4)) this.audio.squeak(); }
    this.lastTrap = s.trapSnapped;
    this.trapJump = Math.max(0, (this.trapJump || 0) - (dt || 0) * 3);
    E.trap.position.y = Math.sin(this.trapJump * Math.PI) * 0.03;
    E.trap.rotation.z = Math.sin(this.trapJump * 20) * 0.1 * this.trapJump;

    // mosca
    if (this.mind?.id !== 'fly') {
      const f = flyAt(t, this.flyState.pos);
      const prev = this.fly.position.clone();
      this.fly.position.copy(f.pos);
      const vel = f.pos.clone().sub(prev);
      if (!f.landed && vel.lengthSq() > 1e-10) this.flyState.yaw = angleDamp(this.flyState.yaw, Math.atan2(vel.x, vel.z), 8, dt || 1);
      this.fly.rotation.set(0, this.flyState.yaw, 0);
      this.flyState.landed = f.landed;
      this.flyState.flying = !f.landed;
      this.flySpeed = dt ? vel.length() / dt : 0;
    }
    this.fly.userData.flap(wt, this.flyState.flying);

    // polvo y olor
    this.atmo.uniforms.uT.value = wt;
    this.scent.material.uniforms.uT.value = wt;
  }

  ripple(strength) {
    if (this.mind?.id !== 'glass') return;
    this.engine.perception.addRipple(0.2 + Math.random() * 0.6, 0.2 + Math.random() * 0.6, this.rt, strength);
  }

  // ======================================================================= MENTES
  /** Modo "ir mirando": la cámara salta de cosa en cosa; ninguna cámara libre. */
  setBrowse(idx = this.browseIdx ?? 0) {
    this.mind = null;
    this.humanFree = false;
    this.browseIdx = ((idx % MINDS.length) + MINDS.length) % MINDS.length;
    const c = (this.ctl = { kind: 'browse', pos: this.cam.position.clone(), look: this.browseLook?.clone() ?? new THREE.Vector3(0, 0.9, -0.5) });
    this.applyFx({ mode: MODE.SPIRIT, aperture: 3.2, focus: 2, vignette: 0.5, grain: 0.022, tint: [1.02, 1.0, 0.97], sat: 1.0, bloom: 0.38, ao: 0.35 });
    this.autoFocus = false;
    this.thermal.disable();
    this.cam.fov = 50; this.cam.near = 0.01; this.cam.far = 16; this.cam.updateProjectionMatrix();
    this.timeScale = 1;
    this.audio.setBody({});
    this.fly.visible = true; this.rat.visible = true;
    this.input.unlock();
    this.browseTo(this.browseIdx, true);
  }

  browseTo(idx, silent = false) {
    this.browseIdx = ((idx % MINDS.length) + MINDS.length) % MINDS.length;
    if (!silent) this.audio.click(this.audio.input, 1800, 0.05, 0.03);
  }

  /** a dónde mira la cámara para presentar una mente (se recalcula cada frame: la mosca se mueve) */
  browseShot(m) {
    const objs = this.entityObjects();
    const o = objs[m.entity];
    let center, rad;
    if (m.entity === 'dust') { center = new THREE.Vector3(0.1, 1.35, -1.0); rad = 0.25; }
    else if (m.entity === 'human') {
      const s = this.s;
      center = s.human.inside ? new THREE.Vector3(s.human.x, 1.2, s.human.z) : new THREE.Vector3(ROOM.x0 - 0.3, 1.2, DOOR.cz);
      rad = 0.9;
    } else if (m.entity === 'glass') { center = new THREE.Vector3(WINDOW.cx, 1.62, ROOM.z0); rad = 0.8; }
    else if (m.entity === 'floor') { center = new THREE.Vector3(0.4, 0.0, 1.2); rad = 0.9; }
    else if (m.entity === 'fly') { center = this.fly.position.clone(); rad = 0.012; }
    else if (m.entity === 'rat') { center = this.rat.visible ? this.rat.position.clone().setY(0.04) : new THREE.Vector3(HOLE[0], 0.04, HOLE[1]); rad = 0.12; }
    else {
      const b = new THREE.Box3().setFromObject(o);
      center = b.getCenter(V()); rad = Math.max(b.getSize(V()).length() / 2, 0.04);
    }
    // desde el interior de la sala hacia el objeto, algo elevado
    if (m.entity === 'human') {
      // al humano se le presenta a la altura de los ojos, de frente
      const yaw = this.human.root.rotation.y;
      // de frente si cabe; si no (está mirando a una pared), en tres cuartos
      let best = null;
      for (const a of [0, 0.7, -0.7, 1.4, -1.4, Math.PI]) {
        const p = center.clone().add(new THREE.Vector3(Math.sin(yaw + a) * 2.4, 0.3, Math.cos(yaw + a) * 2.4));
        p.x = clamp(p.x, ROOM.x0 + 0.2, ROOM.x1 - 0.2); p.z = clamp(p.z, ROOM.z0 + 0.2, ROOM.z1 - 0.2);
        const d = p.distanceTo(center);
        if (!best || d > best.d + 0.35) best = { p, d };
      }
      return { pos: best.p, center, dist: best.d };
    }
    const from = new THREE.Vector3(0.7, 1.2, 1.5).sub(center);
    from.y = Math.max(from.y, 0.0) * 0.5 + 0.35;
    if (from.lengthSq() < 0.01) from.set(0.5, 0.5, 1);
    from.normalize();
    const dist = THREE.MathUtils.clamp(rad * 2.6 / Math.tan(THREE.MathUtils.degToRad(25)), 0.06, 3.2);
    const pos = center.clone().addScaledVector(from, dist);
    pos.x = clamp(pos.x, ROOM.x0 + 0.12, ROOM.x1 - 0.12); pos.y = clamp(pos.y, 0.03, ROOM.h - 0.1); pos.z = clamp(pos.z, ROOM.z0 + 0.12, ROOM.z1 - 0.12);
    return { pos, center, dist: pos.distanceTo(center) };
  }

  applyFx(fx) {
    const u = this.engine.perception.uniforms;
    u.uMode.value = fx.mode ?? 0;
    u.uAperture.value = fx.aperture ?? 0;
    u.uFocus.value = fx.focus ?? 2;
    this.autoFocus = fx.focus === undefined;
    u.uVignette.value = fx.vignette ?? 0.35;
    u.uGrain.value = fx.grain ?? 0.02;
    u.uSat.value = fx.sat ?? 1;
    u.uFisheye.value = fx.fisheye ?? 0;
    u.uExposure.value = fx.exposure ?? 1;
    const tn = fx.tint ?? [1, 1, 1]; u.uTint.value.set(tn[0], tn[1], tn[2]);
    const p = fx.param ?? [70, 0, 0, 0]; u.uParam.value.set(p[0], p[1], p[2], p[3]);
    u.uBeam.value = fx.noBeam ? 0 : 1;
    this.engine.bloom.strength = fx.bloom ?? 0.35;
    this.engine.trails.amount = fx.trails ?? 0;
    this.engine.trails.mode = fx.trailMode ?? 0;
    this.engine.trails.reset = true;
    const r = fx.ao ?? 0.35;
    this.engine.gtao.updateGtaoMaterial({ radius: Math.max(r, 0.02) });
    this.engine.gtao.blendIntensity = r === 0 ? 0 : 0.85;
    this.atmo.dust.visible = !fx.thermal;
    this.scent.visible = !!fx.scent;
    this.scent.material.uniforms.uAmount.value = fx.scent ? 1 : 0;
    this.fogOn = !!fx.fog;
  }

  possess(id) {
    if (this.switching) return;
    if (this.mind?.id === id) return;
    this.switching = true;
    if (this.mindById[id].control !== 'glass') { this.input.lock(); try { this.engine.renderer.domElement.requestPointerLock?.()?.catch?.(() => {}); } catch (e) {} }
    this.audio.whoosh();
    this.ui.fade(true);
    setTimeout(() => {
      this.enterMind(id);
      this.trans = 1;
      this.ui.fade(false);
      this.switching = false;
    }, 520);
  }

  leaveMind() {
    if (this.mind?.id === 'human') { this.humanFree = false; this.ov = {}; this.snap = null; }
    if (this.mind?.id === 'fly') this.fly.visible = true;
    if (this.mind?.id === 'rat') this.rat.visible = true;
    this.thermal.disable();
    this.engine.renderer.toneMapping = THREE.AgXToneMapping;
    this.ui.prompt(null); this.ui.meter(null);
    this.ui.labels([]);
    this.clockStopped = false;
  }

  enterMind(id) {
    this.leaveMind();
    const m = this.mindById[id];
    this.mind = m;
    this.timeScale = m.timeScale ?? 1;
    const v = m.view || {};
    this.cam.fov = v.fov ?? 70; this.cam.near = v.near ?? 0.02; this.cam.far = v.far ?? 40; this.cam.updateProjectionMatrix();
    this.applyFx(m.fx || {});
    this.audio.setBody(m.audio || {});
    if (m.fx?.thermal) { this.thermal.enable(); this.engine.renderer.toneMapping = THREE.NeutralToneMapping; }
    this.ui.setMind(m, 'Ahora eres');
    this.thoughtState = { text: null, at: this.rt - 3, idleAt: this.rt + 3, idleIdx: Math.floor(Math.random() * 5) };
    const c = (this.ctl = { kind: m.control, yaw: 0, pitch: 0 });
    m.needsLock = m.control !== 'glass';
    if (m.needsLock) this.input.lock(); else this.input.unlock();

    const E = this.entityObjects();
    if (m.control === 'fly') {
      this.fly.visible = false;
      c.pos = this.fly.position.clone().add(new THREE.Vector3(0, this.flyState.landed ? 0.012 : 0.004, 0));
      c.vel = V(); c.yaw = this.flyState.yaw + Math.PI; c.pitch = 0; c.landed = this.flyState.landed; c.normal = new THREE.Vector3(0, 1, 0);
    } else if (m.control === 'rat') {
      this.rat.visible = false;
      c.pos = new THREE.Vector2(this.rat.position.x, this.rat.position.z);
      if (!this.s.rat.visible) c.pos.set(HOLE[0] + 0.05, HOLE[1] + 0.25);
      c.yaw = this.ratYaw + Math.PI; c.pitch = 0.05; c.vel = new THREE.Vector2();
    } else if (m.control === 'human') {
      this.snap = { ...this.s };
      this.ov = {};
      if (this.s.carryingKettle) this.ov.carry = true;
      let hx = this.human.root.position.x, hz = this.human.root.position.z;
      if (!this.s.human.inside) { hx = -1.9; hz = 1.05; this.snap.door = 1; }
      c.pos = new THREE.Vector2(hx, hz);
      c.yaw = this.human.root.rotation.y + Math.PI; c.pitch = -0.12; c.vel = new THREE.Vector2(); c.bob = 0;
      this.humanFree = true;
    } else if (m.control === 'dust') {
      c.pos = new THREE.Vector3(0.1, 1.35, -1.0); c.vel = V(); c.yaw = Math.PI * 0.95; c.pitch = 0.1;
    } else if (m.control === 'glass') {
      c.outside = false;
      c.base = new THREE.Vector3(WINDOW.cx, (WINDOW.y0 + WINDOW.y1) / 2, ROOM.z0 + 0.0);
      this.fogCtx.fillStyle = '#fff'; this.fogCtx.fillRect(0, 0, 512, 512); this.fogTex.needsUpdate = true;
    } else {
      // look / clock: ojo fijo calculado a partir del objeto
      const o = E[m.entity];
      const eye = this.eyeFor(m, o);
      c.eye = eye;
      const look = new THREE.Vector3(...(m.eye?.look ?? [0, 1, 0]));
      const dir = look.sub(eye).normalize();
      c.baseYaw = Math.atan2(-dir.x, -dir.z); c.basePitch = Math.asin(clamp(dir.y, -1, 1));
      c.limitYaw = m.eye?.limitYaw ?? 1.2; c.limitPitch = m.eye?.limitPitch ?? 0.6;
      c.yaw = 0; c.pitch = 0;
    }
    if (m.control === 'clock') { c.scrub = 0; }
  }

  eyeFor(m, o) {
    const at = m.eye?.at;
    const box = o ? new THREE.Box3().setFromObject(o) : null;
    const ctr = box ? box.getCenter(V()) : V();
    if (m.eye?.offset) return o.getWorldPosition(V()).add(new THREE.Vector3(...m.eye.offset));
    switch (at) {
      case 'bulb': return this.k.bulbPos.clone().add(new THREE.Vector3(0, -0.2, 0));
      case 'rim': return new THREE.Vector3(ctr.x, box.max.y + 0.012, ctr.z);
      case 'spout': return new THREE.Vector3(box.min.x - 0.01, box.max.y - 0.04, ctr.z);
      case 'under': return new THREE.Vector3(ctr.x + 0.2, 0.32, ctr.z);
      case 'seat': return new THREE.Vector3(ctr.x, 0.62, ctr.z);
      case 'door': return new THREE.Vector3(ROOM.x0 + 0.06, 1.55, DOOR.cz - 0.2);
      case 'floor': return new THREE.Vector3(0.6, 0.012, 1.5);
      case 'switch': return this.room.switchPlate.getWorldPosition(V()).add(new THREE.Vector3(0.03, 0, 0));
      case 'front': return new THREE.Vector3(box.min.x - 0.03, ctr.y, ctr.z);
      case 'center': return ctr;
      default: return new THREE.Vector3(ctr.x, box.max.y + 0.008 + (m.eye?.lift ?? 0), ctr.z);
    }
  }

  // ======================================================================= CONTROL
  updateControl(dt) {
    const c = this.ctl, inp = this.input, cam = this.cam;
    const sens = 0.0022 * (cam.fov / 70);
    const look = (limit = 1.45) => {
      c.yaw -= inp.dx * sens; c.pitch -= inp.dy * sens; c.pitch = clamp(c.pitch, -limit, limit);
    };
    const fwd = (inp.down('KeyW') ? 1 : 0) - (inp.down('KeyS') ? 1 : 0);
    const side = (inp.down('KeyD') ? 1 : 0) - (inp.down('KeyA') ? 1 : 0);

    if (c.kind === 'browse') {
      const shot = this.browseShot(MINDS[this.browseIdx]);
      // un poco de paralaje con el ratón para que se sienta vivo
      const par = new THREE.Vector3((inp.mouse.nx - 0.5) * 0.25, (0.5 - inp.mouse.ny) * 0.15, 0).multiplyScalar(Math.min(shot.dist, 1.5));
      const target = shot.pos.clone().add(par);
      const k = 1 - Math.exp(-3.2 * dt);
      c.pos.lerp(target, k); c.look.lerp(shot.center, 1 - Math.exp(-4.5 * dt));
      cam.position.copy(c.pos); cam.lookAt(tmp.copy(c.look).add(new THREE.Vector3(0, MINDS[this.browseIdx].entity === 'human' ? 0 : -Math.min(shot.dist, 2.5) * 0.13, 0)));
      this.browseLook = c.look;
      const u = this.engine.perception.uniforms;
      u.uFocus.value = damp(u.uFocus.value, cam.position.distanceTo(shot.center), 6, dt);
      u.uAperture.value = THREE.MathUtils.clamp(3.2 / Math.max(shot.dist, 0.15), 2, 14);
      return;
    }

    if (c.kind === 'fly') {
      look(1.5);
      euler.set(c.pitch, c.yaw, 0); cam.quaternion.setFromEuler(euler);
      if (c.landed) {
        if (inp.hit('KeyE') || fwd > 0 || inp.down('Space')) { c.landed = false; c.vel.copy(c.normal).multiplyScalar(0.35); this.ui.thought('¡Arriba!'); }
      } else {
        const acc = new THREE.Vector3(side * 1.2, (inp.down('Space') ? 1.2 : 0) - (inp.down('ShiftLeft') ? 1.2 : 0), -fwd * 2.4).applyQuaternion(cam.quaternion);
        // la mosca nunca está quieta del todo
        acc.x += Math.sin(this.rt * 13) * 0.25; acc.y += Math.sin(this.rt * 17 + 1) * 0.25; acc.z += Math.cos(this.rt * 11) * 0.25;
        c.vel.addScaledVector(acc, dt).multiplyScalar(Math.exp(-2.4 * dt));
        const step = c.vel.length() * dt;
        if (step > 1e-6) {
          this.raycaster.set(c.pos, c.vel.clone().normalize());
          this.raycaster.far = step + 0.006;
          const hit = this.raycaster.intersectObjects(this.flyColliders, false)[0];
          if (hit) {
            const n = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : new THREE.Vector3(0, 1, 0);
            if (inp.down('KeyE') || c.vel.length() < 0.45) {
              c.landed = true; c.normal.copy(n); c.pos.copy(hit.point).addScaledVector(n, 0.004); c.vel.set(0, 0, 0);
              this.audio.click(this.audio.flyPan, 6000, 0.05, 0.01);
            } else {
              c.vel.reflect(n).multiplyScalar(0.35); this.audio.click(this.audio.flyPan, 4000, 0.12, 0.015);
            }
          } else c.pos.addScaledVector(c.vel, dt);
        }
        if (inp.hit('KeyE')) this.ui.thought('¿Dónde me poso?');
      }
      c.pos.x = clamp(c.pos.x, ROOM.x0 + 0.01, ROOM.x1 - 0.01); c.pos.y = clamp(c.pos.y, 0.004, ROOM.h - 0.01); c.pos.z = clamp(c.pos.z, ROOM.z0 - 0.06, ROOM.z1 - 0.01);
      cam.position.copy(c.pos);
      if (!c.landed) { cam.position.y += Math.sin(this.rt * 31) * 0.0006; }
      this.fly.position.copy(c.pos); this.flyState.flying = !c.landed; this.flySpeed = c.vel.length();
      return;
    }

    if (c.kind === 'rat' || c.kind === 'human') {
      const isRat = c.kind === 'rat';
      look(isRat ? 0.9 : 1.35);
      const run = inp.down('ShiftLeft');
      const speed = isRat ? (run ? 1.25 : 0.55) : (run ? 1.9 : 1.15);
      const sniff = isRat && inp.mouse.right;
      const want = new THREE.Vector2(side, -fwd);
      if (want.lengthSq() > 1) want.normalize();
      want.rotateAround(new THREE.Vector2(), -c.yaw).multiplyScalar(sniff ? 0 : speed);
      c.vel.lerp(want, 1 - Math.exp(-(isRat ? 12 : 7) * dt));
      const next = c.pos.clone().addScaledVector(c.vel, dt);
      const r = isRat ? 0.05 : 0.22;
      const obs = isRat ? this.obstaclesRat : this.obstaclesHuman;
      // límites de la sala (y el pasillo para el humano, por la puerta)
      const inDoor = Math.abs(next.y - DOOR.cz) < DOOR.w / 2 - r && !isRat;
      next.x = clamp(next.x, inDoor ? ROOM.x0 - 2.0 : ROOM.x0 + r, ROOM.x1 - r);
      if (next.x > ROOM.x0 + r - 0.01) next.y = clamp(next.y, ROOM.z0 + r, ROOM.z1 - r);
      else next.y = clamp(next.y, DOOR.cz - 0.7, DOOR.cz + 0.7);
      for (const [x0, z0, x1, z1] of obs) {
        if (next.x > x0 - r && next.x < x1 + r && next.y > z0 - r && next.y < z1 + r) {
          // empuja hacia el borde más cercano
          const dx0 = next.x - (x0 - r), dx1 = (x1 + r) - next.x, dz0 = next.y - (z0 - r), dz1 = (z1 + r) - next.y;
          const mn = Math.min(dx0, dx1, dz0, dz1);
          if (mn === dx0) next.x = x0 - r; else if (mn === dx1) next.x = x1 + r; else if (mn === dz0) next.y = z0 - r; else next.y = z1 + r;
        }
      }
      c.pos.copy(next);
      c.moving = c.vel.length() > 0.08;
      const sp = c.vel.length();
      c.bob = (c.bob || 0) + dt * sp * (isRat ? 28 : 8.5);
      this.shake = Math.max(0, (this.shake || 0) - dt * 4);
      euler.set(c.pitch, c.yaw, 0); cam.quaternion.setFromEuler(euler);
      if (isRat) {
        cam.position.set(c.pos.x, 0.042 + Math.abs(Math.sin(c.bob)) * 0.006 + (sniff ? Math.sin(this.rt * 40) * 0.002 : 0), c.pos.y);
        cam.position.y += this.shake * 0.004 * Math.sin(this.rt * 60);
        this.rat.position.set(c.pos.x, 0, c.pos.y); this.rat.rotation.y = c.yaw + Math.PI; this.ratYaw = this.rat.rotation.y;
        this.ratU.uRun.value = clamp(sp / 0.8, 0, 1);
        this.scent.material.uniforms.uAmount.value = damp(this.scent.material.uniforms.uAmount.value, sniff ? 3.5 : 1, 4, dt);
        this.engine.perception.uniforms.uAperture.value = damp(this.engine.perception.uniforms.uAperture.value, sniff ? 16 : 9, 4, dt);
        if (inp.hit('KeyE')) { this.audio.squeak(); this.ui.thought('¡Iic!'); }
        // la trampa
        const tp = this.E.trap.position;
        if (!this.s.trapSnapped && Math.hypot(c.pos.x - tp.x, c.pos.y - tp.z) < 0.11) {
          this.ov.trap = true; c.vel.set(c.pos.x - tp.x, c.pos.y - tp.z).normalize().multiplyScalar(4);
          this.ui.thought('¡La trampa! Por poco.');
        }
        if (Math.hypot(c.pos.x - HOLE[0], c.pos.y - HOLE[1]) < 0.12) this.ui.prompt('Tu agujero. Aquí estás a salvo.');
        else this.ui.prompt(null);
      } else {
        const bobY = Math.sin(c.bob) * 0.025 * Math.min(sp, 1.2), bobX = Math.cos(c.bob * 0.5) * 0.012 * Math.min(sp, 1.2);
        cam.position.set(c.pos.x, 1.62 + bobY, c.pos.y);
        cam.position.add(new THREE.Vector3(bobX, 0, 0).applyQuaternion(cam.quaternion));
        if (c.moving && this.wt - this.lastStep > 0.5) { this.lastStep = this.wt; this.audio.thump(c.pos.x, c.pos.y, 0.35); }
        this.humanInteract();
      }
      return;
    }

    if (c.kind === 'dust') {
      look();
      const p = c.pos, tt = this.wt;
      // corrientes de aire: el calor del haz sube
      const inBeam = this.inBeam(p);
      const flow = new THREE.Vector3(Math.sin(tt * 0.3 + p.y * 2) * 0.03, (inBeam ? 0.025 : -0.008) + Math.sin(tt * 0.21 + p.x * 3) * 0.015, Math.cos(tt * 0.27 + p.x) * 0.03);
      euler.set(c.pitch, c.yaw, 0); cam.quaternion.setFromEuler(euler);
      const push = new THREE.Vector3(side, 0, -fwd).applyQuaternion(cam.quaternion).multiplyScalar(0.06);
      c.vel.lerp(flow.add(push), 1 - Math.exp(-1.2 * dt));
      p.addScaledVector(c.vel, dt);
      p.x = clamp(p.x, ROOM.x0 + 0.1, ROOM.x1 - 0.1); p.y = clamp(p.y, 0.05, ROOM.h - 0.05); p.z = clamp(p.z, ROOM.z0 + 0.1, ROOM.z1 - 0.1);
      cam.position.copy(p);
      c.inBeam = inBeam;
      const u = this.engine.perception.uniforms;
      u.uExposure.value = damp(u.uExposure.value, inBeam ? 1.25 : 0.55, 2, dt);
      return;
    }

    if (c.kind === 'glass') {
      // sin pointer lock: el cursor limpia el vaho
      const mx = inp.mouse.nx, my = inp.mouse.ny;
      if (inp.hit('KeyQ')) { c.outside = !c.outside; this.audio.click(this.audio.windowPan, 1200, 0.15, 0.05); }
      const yawT = (c.outside ? 0 : Math.PI) + (mx - 0.5) * -0.6;
      const pitchT = (0.5 - my) * 0.4 - 0.08;
      c.yaw = damp(c.yaw, yawT, 4, dt); c.pitch = damp(c.pitch, pitchT, 4, dt);
      euler.set(c.pitch, c.yaw, 0); cam.quaternion.setFromEuler(euler);
      cam.position.copy(c.base).add(new THREE.Vector3(0, 0, c.outside ? -0.11 : -0.06));
      const g = this.fogCtx;
      if (inp.mouse.down) {
        g.globalCompositeOperation = 'destination-out';
        const grd = g.createRadialGradient(mx * 512, my * 512, 0, mx * 512, my * 512, 34);
        grd.addColorStop(0, 'rgba(0,0,0,0.9)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = grd; g.beginPath(); g.arc(mx * 512, my * 512, 34, 0, 7); g.fill();
        g.globalCompositeOperation = 'source-over';
        this.fogTex.needsUpdate = true;
      }
      // el vaho vuelve, sobre todo si el humano respira cerca
      this.fogAcc = (this.fogAcc || 0) + dt;
      if (this.fogAcc > 0.25) {
        const near = this.s.human.inside && Math.hypot(this.s.human.x - WINDOW.cx, this.s.human.z - ROOM.z0) < 1.0;
        g.fillStyle = `rgba(255,255,255,${near ? 0.05 : 0.012})`; g.fillRect(0, 0, 512, 512);
        this.fogTex.needsUpdate = true; this.fogAcc = 0;
      }
      if (inp.hit('Space')) { this.engine.perception.addRipple(0.5, 0.5, this.rt, 1.5); this.audio.tone(1250, 2.2, 0.08); }
      c.outsideFlag = c.outside;
      return;
    }

    // look / clock
    look(2);
    c.yaw = clamp(c.yaw, -c.limitYaw, c.limitYaw); c.pitch = clamp(c.pitch, -c.limitPitch, c.limitPitch);
    euler.set(c.basePitch + c.pitch, c.baseYaw + c.yaw, 0); cam.quaternion.setFromEuler(euler);
    cam.position.copy(c.eye);
    if (this.mind.entity === 'cup' || this.mind.entity === 'cup2') {
      if (this.rattle > 0) cam.position.x += Math.sin(this.rt * 90) * 0.0015 * this.rattle;
    }
    this.mindActions(dt);
  }

  inBeam(p) {
    const sd = this.engine.perception.uniforms.uSunDir.value;
    const s = ((ROOM.z0 - 0.1) - p.z) / sd.z;
    const q = p.clone().addScaledVector(sd, s);
    return s < 0 && Math.abs(q.x - WINDOW.cx) < WINDOW.w / 2 && q.y > WINDOW.y0 && q.y < WINDOW.y1;
  }

  /** acciones propias de cada objeto */
  mindActions(dt) {
    const inp = this.input, id = this.mind.id;
    this.rattle = Math.max(0, (this.rattle || 0) - dt * 2);
    if (id === 'cup' && inp.hit('Space')) { this.rattle = 1; this.audio.rattle(); this.ui.thought(this.s.teaLevel > 0.5 ? 'Tiemblo y el té tiembla conmigo.' : 'Tiemblo. Nadie se entera.'); }
    if (id === 'kettle' && inp.hit('Space')) {
      if (this.s.kettleTemp > 85) { this.audio.tone(2100, 2.5, 0.12, this.audio.kettlePan); this.audio.tone(2180, 2.5, 0.06, this.audio.kettlePan); this.ui.thought('¡Fiiiiiii!'); }
      else this.ui.thought('Todavía estoy fría.');
    }
    if (id === 'bottle' && inp.hit('Space')) { this.audio.tone(196, 3, 0.18); this.ui.thought('Uuuuuu.'); }
    if ((id === 'bulb' || id === 'switch') && inp.hit('Space')) { this.ov.lamp = !this.s.lampOn; }
    if (id === 'trap' && inp.hit('Space') && !this.s.trapSnapped) { this.ov.trap = true; this.ui.thought(this.rat.visible && this.rat.position.distanceTo(this.E.trap.position) < 0.4 ? '¡Ahora! …Ha sido más rápida.' : 'Salto. No había nadie.'); }
    if (id === 'trap') {
      const d = this.rat.visible ? this.rat.position.distanceTo(this.E.trap.position) : 9;
      this.engine.perception.uniforms.uAlert.value = clamp(1 - d / 1.2, 0, 1);
    }
    if (id === 'plant' || id === 'bigplant' || id === 'cactus') {
      const p = this.cam.position;
      const lit = this.inBeam(p) ? 1 : 0.15;
      if (id === 'plant') {
        this.lightDrunk = clamp((this.lightDrunk || 0) + (inp.down('Space') ? lit * dt * 0.08 : -dt * 0.01), 0, 1);
        this.ui.meter('Luz bebida', this.lightDrunk);
        this.engine.perception.uniforms.uExposure.value = damp(this.engine.perception.uniforms.uExposure.value, inp.down('Space') ? 1.45 : 1, 3, dt);
        if (this.lightDrunk >= 1 && !this.plantSaid) { this.plantSaid = true; this.ui.thought('Ya he comido sol por hoy.'); }
      }
    }
    if (id === 'clock') {
      const c = this.ctl;
      let scrub = 0;
      if (inp.wheel) c.scrub = clamp((c.scrub || 0) + inp.wheel * 6, -40, 40);
      if (inp.down('KeyQ')) scrub = -30; else if (inp.down('KeyE')) scrub = 30;
      else scrub = c.scrub || 0;
      c.scrub = damp(c.scrub || 0, 0, 1.5, dt);
      if (inp.hit('Space')) { this.clockStopped = !this.clockStopped; this.ui.thought(this.clockStopped ? 'Que nada se mueva.' : 'Seguimos.'); }
      this.timeScale = this.clockStopped ? 0 : (Math.abs(scrub) > 0.5 ? scrub : 1);
      if (scrub < -0.5) this.ov = {};
      c.scrubSign = Math.sign(scrub);
    }
  }

  humanInteract() {
    const p = this.ctl.pos, s = this.s, E = this.E;
    const dist = (o) => { const w = o.getWorldPosition(tmp); return Math.hypot(w.x - p.x, w.z - p.y); };
    const facing = (o) => { const w = o.getWorldPosition(tmp).sub(this.cam.position).normalize(); return w.dot(this.cam.getWorldDirection(tmp2)) > 0.55; };
    let prompt = null, act = null;
    const kettleD = Math.hypot(this.kettleHome.pos.x - p.x, this.kettleHome.pos.z - p.y);
    if (dist(this.room.switchPlate) < 0.9 && facing(this.room.switchPlate)) { prompt = s.lampOn ? 'apagar la luz' : 'encender la luz'; act = () => (this.ov.lamp = !s.lampOn); }
    else if (this.ov.carry && dist(E.cup) < 0.9 && s.teaLevel < 0.5) { prompt = 'servir el té'; act = () => (this.ov.pourAt = this.t); }
    else if (this.ov.carry && kettleD < 0.95) { prompt = 'dejar el hervidor'; act = () => { this.ov.carry = false; }; }
    else if (!this.ov.carry && kettleD < 0.95 && facing(E.kettle)) {
      if (s.kettleTemp > 90) { prompt = 'coger el hervidor'; act = () => { this.ov.carry = true; }; }
      else if (this.ov.kettleOnAt == null) { prompt = 'poner agua a hervir'; act = () => { this.ov.kettleOnAt = this.t; }; }
      else prompt = 'esperar a que hierva…';
    }
    else if (s.croissant && dist(E.croissant) < 0.95 && facing(E.croissant)) { prompt = 'coger el cruasán'; act = () => (this.ov.croissantAt = this.t); }
    else if (dist(E.spectacles) < 0.9 && facing(E.spectacles)) { prompt = 'mis gafas… luego'; }
    else if (Math.hypot(WINDOW.cx - p.x, ROOM.z0 - p.y) < 1.1 && facing(this.room.glass)) { prompt = 'respirar contra el cristal'; act = () => { this.ui.thought('El cristal se empaña.'); }; }
    this.ui.prompt(prompt ? `<kbd>E</kbd> ${prompt}` : null);
    if (act && this.input.hit('KeyE')) act();
  }

  // ======================================================================= PENSAMIENTOS
  distances() {
    const p = this.cam.position, s = this.s, E = this.E;
    const d3 = (v) => p.distanceTo(v);
    return {
      human: s.human.inside || this.humanFree ? Math.hypot(p.x - s.human.x, p.z - s.human.z) : 99,
      rat: this.rat.visible ? d3(this.rat.position) : 99,
      fly: d3(this.fly.position),
      cup: d3(this.cupCenter), lamp: d3(this.k.bulbPos), window: Math.abs(p.z - ROOM.z0) + (Math.abs(p.x - WINDOW.cx) > WINDOW.w / 2 ? 1 : 0),
      croissant: d3(E.croissant.position), trap: d3(E.trap.position), crumbs: Math.hypot(p.x + 0.06, p.z - 0.66), spectacles: d3(E.spectacles.position),
      inBeam: this.ctl.inBeam, stopped: this.clockStopped, scrub: this.ctl.scrubSign || 0, outside: this.ctl.outsideFlag,
    };
  }

  updateThoughts() {
    const ts = this.thoughtState, now = this.rt;
    if (!this.mind) {
      return;
    }
    if (now - ts.at < 11) return;
    const d = this.distances();
    let text = null;
    for (const [cond, txt] of this.mind.thoughts || []) { if (cond(this.s, d)) { text = txt; break; } }
    if (text && text !== ts.text) { ts.text = text; ts.at = now; this.ui.thought(text); return; }
    if (!text && now > ts.idleAt && this.mind.idle?.length) {
      const line = this.mind.idle[ts.idleIdx++ % this.mind.idle.length];
      ts.text = line; ts.at = now; ts.idleAt = now + 28; this.ui.thought(line);
    }
    if (!text) ts.text = null;
  }

  // ======================================================================= ETIQUETAS HUMANAS
  updateLabels() {
    if (!this.mind?.fx?.labels) return;
    const E = this.E, s = this.s;
    const items = [
      ['cup', E.cup, s.teaLevel > 0.5 ? 'té' : 'taza'], ['teapot', E.teapot, 'tetera'], ['sugar', E.sugar, 'azúcar'],
      ['croissant', E.croissant, 'cruasán'], ['bowl', E.bowl, 'fruta'], ['bananas', E.bananas, 'plátanos'],
      ['spectacles', E.spectacles, 'mis gafas'], ['kettle', E.kettle, s.kettleTemp > 90 ? 'hierve' : 'hervidor'],
      ['clock', E.clock, clockString(this.t).slice(0, 5)], ['frame', E.frame, 'mamá'], ['table', E.table, 'mesa'],
      ['window', this.room.glass, 'ventana'], ['plant', E.plant, 'regar'], ['trap', E.trap, 'ratonera'],
      ['books', E.books, 'enciclopedia'], ['bottle', E.bottle, 'vino'], ['stove', E.stove, 'cocina'],
      ['lamp', E.lamp, 'luz'], ['fly', this.fly, 'mosca'], ['chair', E.chairs[2], 'silla'], ['cup2', E.cup2, 'su taza'],
      ['lemon', E.lemon, 'limón'], ['basket', E.basket, 'cebollas'],
    ];
    const out = [];
    const cp = this.cam.position, fw = this.cam.getWorldDirection(tmp3).clone();
    for (const [key, o, text] of items) {
      if (!o || !o.visible) continue;
      const w = new THREE.Box3().setFromObject(o).getCenter(tmp);
      w.y += 0.06;
      const dist = cp.distanceTo(w);
      if (dist > 2.6 || (key === 'fly' && dist > 0.9)) continue;
      const dir = tmp2.copy(w).sub(cp).normalize();
      const dot = dir.dot(fw);
      if (dot < 0.8) continue;
      const pr = w.clone().project(this.cam);
      out.push({ key, text, x: (pr.x * 0.5 + 0.5) * innerWidth, y: (-pr.y * 0.5 + 0.5) * innerHeight - 10, a: clamp((dot - 0.8) * 8, 0, 1) * clamp((2.6 - dist) / 1.0, 0, 1), size: clamp(30 - dist * 5, 17, 28), dist });
    }
    out.sort((a, b) => a.dist - b.dist);
    this.ui.labels(out.slice(0, 5));
  }

  // ======================================================================= MINIATURAS
  makeThumbs() {
    const r = this.engine.renderer, cam = new THREE.PerspectiveCamera(35, 1, 0.002, 30);
    const TW = 320, TH = 240;
    const canvas = document.createElement('canvas'); canvas.width = TW; canvas.height = TH;
    const ctx = canvas.getContext('2d');
    const size = r.getSize(new THREE.Vector2());
    const objs = this.entityObjects();
    const prevBg = this.scene.background;
    this.lampLight.intensity = 3; this.lampLight.visible = true; this.bulbMat.emissiveIntensity = 20;
    const cb = new THREE.Box3().setFromObject(this.E.croissant); this.fly.position.set(-0.08, cb.max.y - 0.002, 0.06); this.fly.rotation.y = 0.8; this.flyState.flying = false; this.fly.userData.flap(0, false);
    this.rat.position.set(-0.6, 0, 1.25); this.rat.rotation.y = 2.2; this.rat.visible = true;
    this.human.root.position.set(0.35, 0, -1.55); this.human.root.visible = true; this.human.root.rotation.y = 0.35;
    this.scene.updateMatrixWorld(true);
    const frame = (o, dirV, fit = 1.6) => {
      const b = new THREE.Box3().setFromObject(o);
      const c = b.getCenter(V()); const rad = b.getSize(V()).length() / 2;
      const dist = (rad * fit) / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
      cam.position.copy(c).addScaledVector(dirV.clone().normalize(), dist);
      cam.near = dist * 0.05; cam.far = dist * 40; cam.updateProjectionMatrix();
      cam.lookAt(c);
    };
    for (const m of MINDS) {
      const o = objs[m.entity];
      let dirV = new THREE.Vector3(0.7, 0.55, 1);
      if (m.entity === 'dust') {
        cam.position.set(0.9, 1.1, 0.9); cam.lookAt(0.0, 0.9, -1.2); cam.near = 0.02; cam.far = 30; cam.updateProjectionMatrix();
      } else if (m.entity === 'glass') {
        cam.position.set(0.3, 1.5, -0.6); cam.lookAt(0.3, 1.62, -2.25);
      } else if (m.entity === 'human') {
        this.human.update(0.5, false);
        cam.position.set(1.35, 1.35, 1.0); cam.lookAt(0.35, 1.0, -1.55);
      } else if (m.entity === 'floor') {
        cam.position.set(1.2, 0.25, 1.8); cam.lookAt(0, 0, 0);
      } else if (m.entity === 'door') {
        cam.position.set(-1.2, 1.2, 0.2); cam.lookAt(-2.75, 1.0, 1.05);
      } else if (m.entity === 'switch') {
        cam.position.set(-2.3, 1.32, 0.15); cam.lookAt(-2.74, 1.25, 0.39);
      } else if (m.entity === 'lamp') {
        cam.position.set(0.9, 1.6, 0.9); cam.lookAt(-0.05, 2.2, -0.28);
      } else if (m.entity === 'clock' || m.entity === 'frame') {
        frame(o, m.entity === 'clock' ? new THREE.Vector3(1, -0.15, 0.3) : new THREE.Vector3(0.3, -0.1, 1), 1.3);
      } else if (o) {
        if (m.entity === 'fly') { const p = this.fly.position; cam.position.set(p.x + 0.035, p.y + 0.025, p.z + 0.045); cam.near = 0.005; cam.far = 10; cam.updateProjectionMatrix(); cam.lookAt(p); }
        if (m.entity === 'rat') dirV = new THREE.Vector3(1, 0.5, 0.8);
        if (['cabinet', 'stove', 'books', 'jug', 'oillamp', 'bottle', 'kettle'].includes(m.entity)) dirV = new THREE.Vector3(-1, 0.45, 0.3);
        if (m.entity !== 'fly') frame(o, dirV, m.entity === 'table' ? 0.9 : 1.25);
      }
      r.setRenderTarget(null);
      r.setViewport(0, 0, TW, TH); r.setScissor(0, 0, TW, TH); r.setScissorTest(true);
      cam.aspect = TW / TH; cam.updateProjectionMatrix();
      r.render(this.scene, cam);
      ctx.clearRect(0, 0, TW, TH);
      const pr = r.getPixelRatio();
      ctx.drawImage(r.domElement, 0, r.domElement.height - TH * pr, TW * pr, TH * pr, 0, 0, TW, TH);
      this.ui.thumbs[m.id] = canvas.toDataURL('image/jpeg', 0.86);
    }
    r.setScissorTest(false); r.setViewport(0, 0, size.x, size.y);
    this.scene.background = prevBg;
    this.lampLight.intensity = 0;
  }

  // ======================================================================= BUCLE
  start() {
    this.started = true;
    document.getElementById('intro').classList.add('gone');
    document.getElementById('hud').hidden = false;
    // el audio necesita un gesto: arranca con la primera tecla o clic
    const wake = () => { this.audio.start(); removeEventListener('pointerdown', wake); removeEventListener('keydown', wake); };
    addEventListener('pointerdown', wake); addEventListener('keydown', wake);
    this.ui.openPicker(true);
  }

  update(dt) {
    this.rt += dt;
    const inp = this.input;
    if (this.started) {
      if (!this.ui.pickerOpen && !this.switching && performance.now() - (this.ui.closedAt || 0) > 300 && (inp.hit('Tab') || inp.hit('Backspace'))) { this.input.unlock(); this.ui.openPicker(false, this.mind?.id); }
    }

    // tiempo
    const scale = this.ui.pickerOpen ? Math.min(this.timeScale, 1) : this.timeScale;
    const prevT = this.t;
    this.t += dt * scale;
    if (this.t >= LOOP) { this.t -= LOOP; this.ov = {}; if (this.humanFree) this.snap = stateAt(this.t); this.lastTrap = false; }
    if (this.t < 0) { this.t += LOOP; this.ov = {}; }
    this.wt += dt * Math.abs(scale);
    if (prevT > this.t + 1) this.lastTrap = false;

    this.s = this.computeState();
    if (this.started && (!this.ui.pickerOpen || this.ctl.kind === 'browse')) this.updateControl(dt);
    else if (!this.started) {
      // vista de presentación: una deriva lenta
      const a = this.rt * 0.05;
      this.cam.position.set(2.0 + Math.sin(a) * 0.25, 1.45 + Math.sin(a * 1.3) * 0.05, 1.9);
      this.cam.lookAt(-0.2, 0.95, -0.9);
    }
    this.cam.updateMatrixWorld();
    this.applyWorld(dt);
    this.thermal.update(this.wt);

    // autoenfoque: lo que hay en el centro
    const u = this.engine.perception.uniforms;
    u.uTime.value = this.rt;
    u.uTick.value = this.t;
    u.uLight.value = this.s.lampOn ? 1 : 0;
    u.uHeat.value = clamp((this.s.kettleTemp - 30) / 70, 0, 1);
    this.trans = Math.max(0, this.trans - dt * 0.9);
    u.uTrans.value = this.trans;
    if (this.autoFocus && this.raycaster) {
      this.raycaster.setFromCamera({ x: 0, y: 0 }, this.cam);
      this.raycaster.far = 20;
      const hit = this.raycaster.intersectObjects(this.flyColliders, false)[0];
      const f = hit ? hit.distance : 4;
      u.uFocus.value = damp(u.uFocus.value, f, 5, dt);
    }
    this.atmo.uniforms.uPx.value = this.engine.renderer.getPixelRatio() * (innerHeight / 900) * (60 / this.cam.fov);
    this.steamK.material.uniforms.uPx.value = this.steamC.material.uniforms.uPx.value = this.scent.material.uniforms.uPx.value = this.atmo.uniforms.uPx.value;

    this.ui.crosshair(this.mind && ['fly', 'rat', 'human'].includes(this.mind.control));


    this.audio.setListener(this.cam);
    this.audio.update(this.s, { flyPos: this.fly.position, flyFlying: this.flyState.flying, flySpeed: this.flySpeed || 0, ratPos: this.rat.position, timeScale: Math.abs(this.timeScale), isFly: this.mind?.id === 'fly' });
    this.ui.setClock(clockString(this.t), this.timeScale);
    if (this.started) { this.updateThoughts(); this.updateLabels(); }
    inp.endFrame();
  }
}
