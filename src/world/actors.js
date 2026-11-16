import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { manager, ASSETS } from '../core/assets.js';

// ---------------------------------------------------------------- MOSCA
export function buildFly() {
  const g = new THREE.Group();
  g.name = 'fly';
  const body = new THREE.Group();
  g.add(body);
  const hairy = new THREE.MeshPhysicalMaterial({ color: 0x1b1c20, roughness: 0.5, metalness: 0.1, sheen: 1, sheenColor: new THREE.Color(0x6a6a70), sheenRoughness: 0.6 });
  const abdomenMat = new THREE.MeshPhysicalMaterial({ color: 0x1a2a1e, roughness: 0.25, metalness: 0.6, iridescence: 1, iridescenceIOR: 1.6, iridescenceThicknessRange: [200, 700], clearcoat: 1 });
  const eyeMat = new THREE.MeshPhysicalMaterial({ color: 0x5e100a, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.15, sheen: 0.5, sheenColor: new THREE.Color(0xff5030) });
  const S = (r, sx, sy, sz, m, x, y, z) => { const s = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), m); s.scale.set(sx, sy, sz); s.position.set(x, y, z); s.castShadow = true; body.add(s); return s; };
  S(0.0022, 1, 0.95, 1.15, hairy, 0, 0, 0.0005);           // tórax
  S(0.0024, 1, 0.8, 1.45, abdomenMat, 0, -0.0003, -0.0036); // abdomen
  S(0.0016, 1.15, 1, 0.85, hairy, 0, 0.0002, 0.0034);       // cabeza
  S(0.0012, 0.9, 1.1, 0.9, eyeMat, 0.0011, 0.0004, 0.0038);
  S(0.0012, 0.9, 1.1, 0.9, eyeMat, -0.0011, 0.0004, 0.0038);
  // alas: lámina iridiscente con venas sugeridas por la iridiscencia
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0); wingShape.bezierCurveTo(0.002, 0.0012, 0.0062, 0.0016, 0.0068, 0.0002); wingShape.bezierCurveTo(0.0062, -0.0012, 0.0025, -0.0012, 0, 0);
  const wingGeo = new THREE.ShapeGeometry(wingShape, 12);
  wingGeo.rotateX(-Math.PI / 2);
  wingGeo.rotateY(1.12); // hacia fuera y hacia atrás
  const wingMat = new THREE.MeshPhysicalMaterial({ color: 0x8a9096, transparent: true, opacity: 0.2, roughness: 0.1, iridescence: 1, iridescenceIOR: 1.3, side: THREE.DoubleSide, depthWrite: false });
  const wings = [];
  for (const s of [1, -1]) {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.0012, 0.0016, 0.0004);
    const w = new THREE.Mesh(wingGeo, wingMat);
    if (s < 0) w.scale.x = -1;
    pivot.add(w);
    body.add(pivot);
    wings.push(pivot);
  }
  // patas
  const legMat = new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 0.6 });
  for (let i = 0; i < 6; i++) {
    const side = i < 3 ? 1 : -1, k = i % 3;
    const z0 = 0.0018 - k * 0.0016;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 0.0012, -0.0008, z0),
      new THREE.Vector3(side * 0.0034, 0.0004, z0 + (k - 1) * 0.0012),
      new THREE.Vector3(side * 0.0048, -0.0026, z0 + (k - 1) * 0.0024),
    ]);
    const leg = new THREE.Mesh(new THREE.TubeGeometry(curve, 8, 0.00018, 5), legMat);
    leg.castShadow = true;
    body.add(leg);
  }
  body.position.y = 0.0026;
  g.userData.wings = wings;
  g.userData.flap = (t, flying) => {
    wings.forEach((w, i) => {
      const s = i === 0 ? 1 : -1;
      w.rotation.z = flying ? s * Math.sin(t * 220) * 0.9 : -s * 0.12;
      w.rotation.y = flying ? 0 : s * 0.75;
    });
  };
  return g;
}

// ---------------------------------------------------------------- RATA
export function animateRat(ratScene) {
  const uniforms = { uRun: { value: 0 }, uT: { value: 0 }, uSniff: { value: 0 } };
  ratScene.traverse((o) => {
    if (!o.isMesh) return;
    o.material = o.material.clone();
    o.material.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, uniforms);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
        uniform float uRun, uT, uSniff;`).replace('#include <begin_vertex>', `#include <begin_vertex>
        float zz = transformed.z;
        float tail = smoothstep(-0.03, -0.11, zz);
        float head = smoothstep(0.0, 0.035, zz);
        float gait = uT * 26.0;
        transformed.x += sin(zz * 38.0 - uT * (3.0 + uRun * 18.0)) * (0.002 + tail * (0.012 + uRun * 0.01));
        transformed.y += sin(gait) * 0.0015 * uRun * (1.0 - tail) + tail * sin(uT * 2.1 + zz * 30.0) * 0.003;
        float br = 1.0 + sin(uT * 7.0) * 0.025 * (1.0 - tail) * (1.0 - head);
        transformed.xy *= vec2(br, br);
        // olfateo: la cabeza tiembla y se alza
        transformed.y += head * uSniff * (0.003 + sin(uT * 48.0) * 0.0015);
        transformed.x += head * sin(uT * 31.0) * 0.0012 * uSniff;`);
    };
  });
  return uniforms;
}

// ---------------------------------------------------------------- HUMANO
/**
 * Michelle (personaje Mixamo de los ejemplos de three.js) animada con los clips idle/walk de Xbot:
 * ambos usan el mismo esqueleto mixamorig, así que las pistas se aplican por nombre de hueso.
 */
const HUMAN_FILE = new URLSearchParams(location.search).get('human') === 'michelle' ? 'Michelle.glb' : 'readyplayer.me.glb';
const RPM = HUMAN_FILE.startsWith('ready');

/** Retarget en espacio mundo: Δ = Qsrc(t)·Qsrc_rest⁻¹ ; Qtgt(t) = Δ·Qtgt_rest ; local = Qpadre(t)⁻¹·Qtgt(t) */
function retargetClip(srcRoot, tgtRoot, clip, fps = 30) {
  const srcBones = {};
  srcRoot.traverse((o) => { if (o.isBone) srcBones[o.name] = o; });
  const tgtList = [];
  tgtRoot.traverse((o) => { if (o.isBone) tgtList.push(o); }); // orden: padres primero
  srcRoot.updateMatrixWorld(true); tgtRoot.updateMatrixWorld(true);
  const wq = (o) => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().extractRotation(o.matrixWorld));
  const map = (b) => srcBones[RPM ? 'mixamorig' + b.name : b.name];
  // los reposos no coinciden (T-pose frente a A-pose): orientamos los huesos de brazos y piernas del
  // destino para que apunten igual que los del origen antes de medir el reposo
  const chains = [];
  for (const side of ['Left', 'Right']) {
    chains.push([side + 'Shoulder', side + 'Arm'], [side + 'Arm', side + 'ForeArm'], [side + 'ForeArm', side + 'Hand'], [side + 'Hand', side + 'HandMiddle1'],
      [side + 'UpLeg', side + 'Leg'], [side + 'Leg', side + 'Foot']);
  }
  const tByName = Object.fromEntries(tgtList.map((b) => [b.name.replace(/^mixamorig/, ''), b]));
  const sByName = Object.fromEntries(Object.entries(srcBones).map(([k, v]) => [k.replace(/^mixamorig/, ''), v]));
  const wp = (o) => new THREE.Vector3().setFromMatrixPosition(o.matrixWorld);
  for (const [a, c] of chains) {
    const ta = tByName[a], tc = tByName[c], sa = sByName[a], sc = sByName[c];
    if (!ta || !tc || !sa || !sc) continue;
    tgtRoot.updateMatrixWorld(true);
    const dT = wp(tc).sub(wp(ta)).normalize(), dS = wp(sc).sub(wp(sa)).normalize();
    const fix = new THREE.Quaternion().setFromUnitVectors(dT, dS);
    const world = fix.multiply(wq(ta));
    const parentW = ta.parent ? wq(ta.parent) : new THREE.Quaternion();
    ta.quaternion.copy(parentW.invert().multiply(world));
  }
  tgtRoot.updateMatrixWorld(true);
  const restSrc = new Map(), restTgt = new Map();
  for (const b of tgtList) { const sb = map(b); if (sb) restSrc.set(b, wq(sb)); restTgt.set(b, wq(b)); }
  const parentRest = new Map(tgtList.map((b) => [b, b.parent ? wq(b.parent) : new THREE.Quaternion()]));
  const mixer = new THREE.AnimationMixer(srcRoot);
  mixer.clipAction(clip).play();
  const n = Math.max(2, Math.round(clip.duration * fps));
  const times = new Float32Array(n);
  const values = new Map(tgtList.map((b) => [b, new Float32Array(n * 4)]));
  for (let f = 0; f < n; f++) {
    const t = (f / (n - 1)) * clip.duration;
    times[f] = t;
    mixer.setTime(t);
    srcRoot.updateMatrixWorld(true);
    const world = new Map();
    for (const b of tgtList) {
      const sb = map(b);
      let W;
      if (sb) W = wq(sb).multiply(restSrc.get(b).clone().invert()).multiply(restTgt.get(b));
      else W = (world.get(b.parent) || parentRest.get(b)).clone().multiply(b.quaternion);
      world.set(b, W);
      const P = world.get(b.parent) || parentRest.get(b);
      const L = P.clone().invert().multiply(W);
      L.toArray(values.get(b), f * 4);
    }
  }
  mixer.stopAllAction();
  const tracks = tgtList.filter((b) => map(b)).map((b) => new THREE.QuaternionKeyframeTrack(`${b.name}.quaternion`, times, values.get(b)));
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}

export async function buildHuman() {
  const loader = new GLTFLoader(manager);
  const [body, anims] = await Promise.all([
    loader.loadAsync(`${ASSETS}models/human/${HUMAN_FILE}`),
    loader.loadAsync(`${ASSETS}models/human/Xbot.glb`),
  ]);
  const root = body.scene;
  const meshes = [];
  const shadowOnly = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
      const m = o.material;
      if (m.map) m.map.anisotropy = 8;
      m.roughness = Math.max(m.roughness ?? 0.6, 0.55);
      m.envMapIntensity = 0.9;
      o.userData.mat = m;
      meshes.push(o);
    }
  });
  // los esqueletos tienen orientaciones de reposo distintas: reorientamos cada clip en espacio mundo
  const idleClip = retargetClip(anims.scene, root, anims.animations.find((a) => a.name === 'idle'));
  const walkClip = retargetClip(anims.scene, root, anims.animations.find((a) => a.name === 'walk'));
  const mixer = new THREE.AnimationMixer(root);
  const idle = mixer.clipAction(idleClip);
  const walk = mixer.clipAction(walkClip);
  idle.play(); walk.play();
  walk.setEffectiveWeight(0);
  const hand = root.getObjectByName(RPM ? 'RightHand' : 'mixamorigRightHand');
  const head = root.getObjectByName(RPM ? 'Head' : 'mixamorigHead');
  let w = 0;
  const update = (dt, moving, speed = 1) => {
    w = THREE.MathUtils.damp(w, moving ? 1 : 0, 6, dt);
    walk.setEffectiveWeight(w); idle.setEffectiveWeight(1 - w);
    walk.timeScale = speed;
    mixer.update(dt);
  };
  // cuando eres el humano no te ves a ti mismo, pero sigues proyectando sombra
  const setSelf = (self) => meshes.forEach((o) => { o.material = self ? shadowOnly : o.userData.mat; });
  return { root, meshes, hand, head, update, setSelf };
}

// ---------------------------------------------------------------- partículas
function softDotTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); return t;
}
export const DOT = softDotTexture();

/** Vapor: columna de partículas que suben, se abren y se desvanecen. */
export function buildSteam(count = 70, scale = 1) {
  const geo = new THREE.BufferGeometry();
  const seeds = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) seeds.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4);
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  geo.setAttribute('seed', new THREE.BufferAttribute(seeds, 4));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uAmount: { value: 0 }, uScale: { value: scale }, map: { value: DOT }, uPx: { value: 1 } },
    vertexShader: `attribute vec4 seed; uniform float uT, uAmount, uScale, uPx; varying float vA;
      void main(){
        float life = fract(seed.x + uT * (0.18 + seed.y * 0.12));
        vec3 p = vec3(0.);
        p.y = life * 0.32 * uScale;
        float sw = life * 0.06 * uScale;
        p.x = sin(seed.z * 6.28 + uT * 1.3 + life * 4.0) * sw;
        p.z = cos(seed.w * 6.28 + uT * 1.1 + life * 3.0) * sw;
        vec4 mv = modelViewMatrix * vec4(p, 1.);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = (0.012 + life * 0.09) * uScale * uPx * 900.0 / -mv.z;
        vA = smoothstep(0.0, 0.12, life) * (1.0 - life) * uAmount;
      }`,
    fragmentShader: `uniform sampler2D map; varying float vA; void main(){ float a = texture2D(map, gl_PointCoord).a; gl_FragColor = vec4(vec3(1.0, 0.98, 0.95), a * vA * 0.22); }`,
    transparent: true, depthWrite: false,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}

/** Rastros de olor: sólo la rata los percibe. Volutas que serpentean desde la comida. */
export function buildScent(sources, count = 2400) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3), seed = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const s = sources[i % sources.length];
    pos.set([s.x, s.y, s.z], i * 3);
    seed.set([Math.random(), Math.random(), Math.random(), (i % sources.length)], i * 4);
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('seed', new THREE.BufferAttribute(seed, 4));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uAmount: { value: 0 }, map: { value: DOT }, uPx: { value: 1 } },
    vertexShader: `attribute vec4 seed; uniform float uT, uAmount, uPx; varying float vA; varying float vK;
      void main(){
        float life = fract(seed.x + uT * 0.07);
        vec3 p = position;
        float a = seed.y * 6.28 + life * 5.0 + uT * 0.4;
        p.x += sin(a) * life * 0.9 + sin(uT*0.7 + seed.z*9.) * 0.05;
        p.z += cos(a * 0.8) * life * 0.9;
        p.y += life * 0.25 - life * life * 0.35;
        p.y = max(p.y, 0.01);
        vec4 mv = modelViewMatrix * vec4(p, 1.);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp((0.0025 + 0.006 * life) * uPx * 900.0 / -mv.z, 1.0, 10.0);
        vA = smoothstep(0.0, 0.1, life) * (1.0 - life) * uAmount;
        vK = seed.w;
      }`,
    fragmentShader: `uniform sampler2D map; varying float vA; varying float vK;
      void main(){ float a = texture2D(map, gl_PointCoord).a; vec3 c = mix(vec3(1.0,0.7,0.25), vec3(0.6,1.0,0.4), step(1.5, vK)); gl_FragColor = vec4(c * 2.2, a * vA * 0.7); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}

/** Migas: trocitos irregulares de hojaldre. */
export function buildCrumbs(n, center, spread, y) {
  // trocitos de hojaldre: forma irregular suave, no poliedros
  const geo = new THREE.IcosahedronGeometry(0.0032, 3);
  const p = geo.attributes.position, v = new THREE.Vector3();
  const sx = 0.7 + Math.random() * 0.6, sy = 0.45 + Math.random() * 0.3;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = 1 + 0.22 * Math.sin(v.x * 2100 + 1.3) * Math.sin(v.y * 1900 + 0.4) * Math.sin(v.z * 2300 + 2.1);
    p.setXYZ(i, v.x * n * sx, v.y * n * sy, v.z * n);
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshPhysicalMaterial({ color: 0xd59a4c, roughness: 0.55, sheen: 0.6, sheenColor: new THREE.Color(0xffd08a), sheenRoughness: 0.5 });
  const inst = new THREE.InstancedMesh(geo, mat, n);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  const col = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 6.28, r = Math.pow(Math.random(), 1.5) * spread;
    q.setFromEuler(new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6));
    s.setScalar(0.5 + Math.random() * 1.3);
    m.compose(new THREE.Vector3(center.x + Math.cos(a) * r, y + 0.0015, center.z + Math.sin(a) * r), q, s);
    inst.setMatrixAt(i, m);
    inst.setColorAt(i, col.setHSL(0.09 + Math.random() * 0.03, 0.6, 0.38 + Math.random() * 0.25));
  }
  inst.castShadow = true; inst.receiveShadow = true;
  return inst;
}
