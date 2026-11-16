import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { pbr } from '../core/assets.js';

export const ROOM = { x0: -2.75, x1: 2.75, z0: -2.25, z1: 2.25, h: 2.8, t: 0.18 };
export const WINDOW = { cx: 0.3, w: 1.5, y0: 0.95, y1: 2.3 };
export const DOOR = { cz: 1.05, w: 0.92, h: 2.06 };
export const SUN_DIR = new THREE.Vector3(-0.22, -0.6, 1).normalize(); // hacia donde viaja la luz

function wallWithHoles(width, height, holes, depth, material) {
  const s = new THREE.Shape();
  s.moveTo(0, 0); s.lineTo(width, 0); s.lineTo(width, height); s.lineTo(0, height); s.lineTo(0, 0);
  for (const h of holes) {
    const p = new THREE.Path();
    if (h.arch) {
      const rr = (h.x1 - h.x0) / 2, cx = (h.x0 + h.x1) / 2;
      p.moveTo(h.x0, h.y0); p.lineTo(h.x0, h.y1 - rr); p.absarc(cx, h.y1 - rr, rr, Math.PI, 0, true); p.lineTo(h.x1, h.y0); p.lineTo(h.x0, h.y0);
    } else { p.moveTo(h.x0, h.y0); p.lineTo(h.x0, h.y1); p.lineTo(h.x1, h.y1); p.lineTo(h.x1, h.y0); p.lineTo(h.x0, h.y0); }
    s.holes.push(p);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false });
  const m = new THREE.Mesh(g, material);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

export function buildRoom(scene, engine) {
  RectAreaLightUniformsLib.init();
  const { x0, x1, z0, z1, h, t } = ROOM;
  const W = x1 - x0, D = z1 - z0;
  const group = new THREE.Group();
  group.name = 'room';
  scene.add(group);
  const colliders = []; // mallas sólidas para rayos (mosca, cámara)

  // ---------- materiales ----------
  const plaster = pbr('painted_plaster_wall', { repeat: [0.45, 0.45], color: 0xfff6ea, normalScale: 0.6 });
  const plasterCeil = pbr('painted_plaster_wall', { repeat: [0.4, 0.4], color: 0xf6efe6, normalScale: 0.4 });
  const floorMat = pbr('old_wood_floor', { repeat: [0.55, 0.55], color: 0xffffff, normalScale: 0.9 });
  const tiles = pbr('long_white_tiles', { repeat: [1.1, 1.1], color: 0xe9efe9, normalScale: 0.8 });
  tiles.envMapIntensity = 1.6;
  const paintedWood = new THREE.MeshPhysicalMaterial({ color: 0xece6da, roughness: 0.42, clearcoat: 0.25, clearcoatRoughness: 0.4 });
  const doorMat = pbr('wood_table_worn', { repeat: [0.9, 0.5], color: 0x9a8c7c, normalScale: 0.7 });

  // ---------- suelo y techo ----------
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W + 6, D), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(-2.2, 0, 0);
  floor.receiveShadow = true;
  floor.name = 'floor';
  group.add(floor); colliders.push(floor);
  // el UV del plano va de 0..1: escalamos repeat a metros
  floorMat.map.repeat.set((W + 6) * 0.55, D * 0.55);
  floorMat.normalMap.repeat.copy(floorMat.map.repeat); floorMat.roughnessMap.repeat.copy(floorMat.map.repeat);

  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D), plasterCeil);
  ceil.rotation.x = Math.PI / 2; ceil.position.y = h; ceil.receiveShadow = true; ceil.castShadow = true;
  [plasterCeil.map, plasterCeil.normalMap, plasterCeil.roughnessMap].forEach((tx) => tx.repeat.set(W * 0.4, D * 0.4));
  group.add(ceil); colliders.push(ceil);

  // ---------- paredes ----------
  // trasera (ventana)
  const backWall = wallWithHoles(W + 2 * t, h, [{ x0: WINDOW.cx - x0 + t - WINDOW.w / 2, x1: WINDOW.cx - x0 + t + WINDOW.w / 2, y0: WINDOW.y0, y1: WINDOW.y1 }, { x0: -2.05 - x0 + t - 0.05, x1: -2.05 - x0 + t + 0.05, y0: 0.0001, y1: 0.1, arch: true }], t, plaster);
  backWall.position.set(x0 - t, 0, z0 - t);
  group.add(backWall); colliders.push(backWall);
  // delantera
  const front = wallWithHoles(W + 2 * t, h, [], t, plaster);
  front.position.set(x0 - t, 0, z1);
  group.add(front); colliders.push(front);
  // izquierda (puerta) — se construye en XY y se gira
  const left = wallWithHoles(D, h, [{ x0: D - (DOOR.cz - z0) - DOOR.w / 2, x1: D - (DOOR.cz - z0) + DOOR.w / 2, y0: 0, y1: DOOR.h }], t, plaster);
  left.rotation.y = Math.PI / 2; left.position.set(x0 - t, 0, z1);
  group.add(left); colliders.push(left);
  const right = wallWithHoles(D, h, [], t, plaster);
  right.rotation.y = -Math.PI / 2; right.position.set(x1 + t, 0, z0);
  group.add(right); colliders.push(right);

  // azulejos tras la encimera (pared derecha)
  const tileW = 2.6, tileH = 0.75;
  const tileGeo = new THREE.PlaneGeometry(tileW, tileH);
  const tileWall = new THREE.Mesh(tileGeo, tiles);
  [tiles.map, tiles.normalMap, tiles.roughnessMap].forEach((tx) => tx.repeat.set(tileW * 1.1, tileH * 1.1));
  tileWall.rotation.y = -Math.PI / 2; tileWall.position.set(x1 - 0.004, 0.86 + tileH / 2, -0.35);
  tileWall.receiveShadow = true;
  group.add(tileWall);

  // rodapiés
  const skirt = (len, px, pz, ry) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(len, 0.09, 0.018), paintedWood);
    m.position.set(px, 0.045, pz); m.rotation.y = ry; m.castShadow = m.receiveShadow = true; group.add(m);
  };
  // rodapié trasero partido por la ratonera
  const HX = -2.05, HW = 0.1;
  skirt((HX - HW / 2) - x0, (x0 + HX - HW / 2) / 2, z0 + 0.009, 0);
  skirt(x1 - (HX + HW / 2), (x1 + HX + HW / 2) / 2, z0 + 0.009, 0);
  skirt(W, 0, z1 - 0.009, 0);
  skirt(D, x1 - 0.009, 0, Math.PI / 2);
  skirt(DOOR.cz - DOOR.w / 2 - z0, x0 + 0.009, (z0 + DOOR.cz - DOOR.w / 2) / 2, Math.PI / 2);
  skirt(z1 - DOOR.cz - DOOR.w / 2, x0 + 0.009, (z1 + DOOR.cz + DOOR.w / 2) / 2, Math.PI / 2);

  // ---------- ventana ----------
  const win = new THREE.Group();
  const fw = 0.06, fd = t + 0.04;
  const bar = (w, hh, d, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), paintedWood); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; win.add(m); return m; };
  const wy = (WINDOW.y0 + WINDOW.y1) / 2, wh = WINDOW.y1 - WINDOW.y0;
  bar(WINDOW.w + fw, fw, fd, WINDOW.cx, WINDOW.y1, z0 - t / 2);
  bar(WINDOW.w + fw, fw, fd, WINDOW.cx, WINDOW.y0, z0 - t / 2);
  bar(fw, wh, fd, WINDOW.cx - WINDOW.w / 2, wy, z0 - t / 2);
  bar(fw, wh, fd, WINDOW.cx + WINDOW.w / 2, wy, z0 - t / 2);
  // parteluces
  bar(0.035, wh, 0.05, WINDOW.cx, wy, z0 - t * 0.55);
  bar(WINDOW.w, 0.035, 0.05, WINDOW.cx, WINDOW.y0 + wh * 0.62, z0 - t * 0.55);
  // alféizar
  const sill = bar(WINDOW.w + 0.22, 0.035, 0.26, WINDOW.cx, WINDOW.y0 - 0.0175 + 0.0, z0 + 0.06);
  sill.name = 'sill';
  colliders.push(sill);
  group.add(win);

  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, metalness: 0, roughness: 0.03, transparent: true, opacity: 0.1,
    envMapIntensity: 1.2, ior: 1.5, specularIntensity: 1, side: THREE.DoubleSide, depthWrite: false,
  });
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(WINDOW.w - 0.02, wh - 0.02), glassMat);
  glass.position.set(WINDOW.cx, wy, z0 - t * 0.55 + 0.03);
  glass.name = 'window_glass';
  glass.renderOrder = 5;
  win.add(glass);
  engine.hideFromAO(glass);

  // ---------- puerta y pasillo ----------
  const doorPivot = new THREE.Group();
  doorPivot.position.set(x0 - t / 2, 0, DOOR.cz + DOOR.w / 2);
  const doorLeaf = new THREE.Mesh(new THREE.BoxGeometry(0.045, DOOR.h - 0.01, DOOR.w - 0.02), doorMat);
  doorLeaf.position.set(0, (DOOR.h - 0.01) / 2, -(DOOR.w - 0.02) / 2);
  doorLeaf.castShadow = doorLeaf.receiveShadow = true;
  doorPivot.add(doorLeaf);
  const brass = new THREE.MeshStandardMaterial({ color: 0xc9a45c, metalness: 1, roughness: 0.28 });
  for (const sx of [-1, 1]) {
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.028, 24, 16), brass);
    knob.position.set(sx * 0.05, 1.0, -(DOOR.w - 0.12));
    knob.castShadow = true;
    doorPivot.add(knob);
  }
  group.add(doorPivot);
  // marco de puerta
  const jamb = (w, hh, d, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), paintedWood); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; group.add(m); };
  jamb(t + 0.03, DOOR.h + 0.06, 0.06, x0 - t / 2, (DOOR.h + 0.06) / 2, DOOR.cz - DOOR.w / 2 - 0.027);
  jamb(t + 0.03, DOOR.h + 0.06, 0.06, x0 - t / 2, (DOOR.h + 0.06) / 2, DOOR.cz + DOOR.w / 2 + 0.027);
  jamb(t + 0.03, 0.06, DOOR.w + 0.12, x0 - t / 2, DOOR.h + 0.027, DOOR.cz);

  // pasillo oscuro con luz cálida
  const hallMat = plaster.clone(); hallMat.color = new THREE.Color(0xb7a58f);
  const hallLen = 4, hallW = 1.6, hx = x0 - t - hallLen / 2;
  const hallPlane = (w, hh, px, py, pz, rx, ry) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, hh), hallMat);
    m.position.set(px, py, pz); m.rotation.set(rx, ry, 0); m.receiveShadow = true; m.castShadow = true; group.add(m);
  };
  hallPlane(hallLen, h, hx, h / 2, DOOR.cz - hallW / 2, 0, 0); // pared lateral
  hallPlane(hallLen, h, hx, h / 2, DOOR.cz + hallW / 2, 0, Math.PI);
  hallPlane(hallW, h, x0 - t - hallLen, h / 2, DOOR.cz, 0, Math.PI / 2); // fondo
  hallPlane(hallLen, hallW, hx, h, DOOR.cz, Math.PI / 2, 0); // techo
  const hallLight = new THREE.SpotLight(0xffb36b, 3, 7, 0.9, 0.7, 1.5);
  hallLight.position.set(x0 - 2.6, 2.4, DOOR.cz);
  hallLight.target.position.set(x0 + 1.5, 0, DOOR.cz - 0.2);
  hallLight.castShadow = true;
  hallLight.shadow.mapSize.set(1024, 1024);
  hallLight.shadow.bias = -0.0005;
  group.add(hallLight, hallLight.target);

  // interruptor
  const switchPlate = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.11, 0.075), new THREE.MeshPhysicalMaterial({ color: 0xf4efe6, roughness: 0.35, clearcoat: 0.6 }));
  switchPlate.position.set(x0 + 0.006, 1.25, DOOR.cz - DOOR.w / 2 - 0.2);
  switchPlate.castShadow = true;
  group.add(switchPlate);

  // ratonera: un hueco de verdad en la pared, con su túnel y el yeso mordido alrededor
  const arch = new THREE.Shape();
  const r = 0.05, hh = 0.05;
  arch.moveTo(-r, 0); arch.lineTo(-r, hh); arch.absarc(0, hh, r, Math.PI, 0, true); arch.lineTo(r, 0); arch.lineTo(-r, 0);
  const tunnelGeo = new THREE.ExtrudeGeometry(arch, { depth: t * 0.9, bevelEnabled: false, curveSegments: 20 });
  // oscurece hacia el fondo con color por vértice
  const tp = tunnelGeo.attributes.position, cols = [];
  for (let i = 0; i < tp.count; i++) { const d = tp.getZ(i) / (t * 0.9); const k = 0.09 * Math.pow(1 - d, 2) + 0.005; cols.push(k, k * 0.85, k * 0.7); }
  tunnelGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  const tunnelMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.BackSide });
  const hole = new THREE.Mesh(tunnelGeo, tunnelMat);
  hole.rotation.y = Math.PI; // el túnel se adentra en la pared (-z)
  hole.position.set(HX, 0.0, z0 + 0.002);
  hole.receiveShadow = true;
  group.add(hole);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.12), new THREE.MeshBasicMaterial({ color: 0x010101 }));
  back.position.set(HX, 0.05, z0 - t * 0.85);
  group.add(back);
  // borde de yeso roto
  const lip = new THREE.Mesh(new THREE.RingGeometry(r, r + 0.012, 24, 1, 0, Math.PI), new THREE.MeshStandardMaterial({ color: 0x5e5246, roughness: 1 }));
  lip.position.set(HX, hh, z0 + 0.003);
  group.add(lip);
  // el hueco en la pared trasera: se recorta en la propia geometría (ver agujeros de backWall)

  // ---------- luz ----------
  const sun = new THREE.DirectionalLight(0xffe2b8, 22);
  sun.position.copy(new THREE.Vector3(WINDOW.cx, 1.0, 0.2).addScaledVector(SUN_DIR, -9));
  sun.target.position.set(WINDOW.cx, 1.0, 0.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  const sc = sun.shadow.camera; sc.left = -4.2; sc.right = 4.2; sc.top = 4.2; sc.bottom = -4.2; sc.near = 1; sc.far = 18;
  sun.shadow.bias = -0.0002; sun.shadow.normalBias = 0.02; sun.shadow.radius = 3;
  scene.add(sun, sun.target);

  const windowFill = new THREE.RectAreaLight(0xcfe0ff, 3.2, WINDOW.w, wh);
  windowFill.position.set(WINDOW.cx, wy, z0 + 0.02);
  windowFill.lookAt(WINDOW.cx, wy, 2);
  scene.add(windowFill);

  const bounce = new THREE.HemisphereLight(0xe8eef2, 0x9a7656, 0.6);
  scene.add(bounce);
  // rebote de la mancha de sol (iluminación global falsa, sin sombras)
  const gi = new THREE.PointLight(0xffd2a0, 3.5, 7, 1.2);
  gi.position.set(0.0, 0.35, -0.6);
  const gi2 = new THREE.PointLight(0xffe0bc, 1.6, 6, 1.0);
  gi2.position.set(0.0, 2.3, -0.3);
  scene.add(gi, gi2);

  return { group, colliders, glass, doorPivot, doorLeaf, sun, switchPlate, hole, floor, windowFill };
}
