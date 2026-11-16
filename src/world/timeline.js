import * as THREE from 'three';

/**
 * La mañana es un bucle determinista de LOOP segundos.
 * Todo lo que ocurre sin que nadie lo controle es función pura de t,
 * así el reloj puede rebobinarla y cada mente vive exactamente la misma mañana.
 */
export const LOOP = 180;
export const START_CLOCK = 7 * 3600 + 14 * 60; // 07:14:00

const smooth = (a, b, x) => { const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = THREE.MathUtils.lerp;

/** Camino por puntos con tiempos: [[t,x,z], ...] -> {x,z,yaw,moving} */
function walkPath(keys, t) {
  if (t <= keys[0][0]) return { x: keys[0][1], z: keys[0][2], i: 0, moving: false };
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (t <= b[0]) {
      const still = a[1] === b[1] && a[2] === b[2];
      const k = still ? 0 : smooth(a[0], b[0], t) * 0.15 + ((t - a[0]) / (b[0] - a[0])) * 0.85;
      return { x: lerp(a[1], b[1], k), z: lerp(a[2], b[2], k), i, moving: !still, dir: Math.atan2(b[1] - a[1], b[2] - a[2]) };
    }
  }
  const l = keys[keys.length - 1];
  return { x: l[1], z: l[2], i: keys.length - 1, moving: false };
}

// --- humano: entra, enciende la luz, pone agua, mira por la ventana, sirve té, se lleva el cruasán, se va
export const HUMAN_PATH = [
  [0, -4.2, 1.05], [33, -4.2, 1.05], [37.5, -2.2, 1.0], [39.5, -2.2, 1.0], // 2: interruptor
  [42, -0.6, 1.45], [45, 1.75, 0.5], [52, 1.75, 0.5], // 5: aparador, enciende la tetera
  [54.5, 1.5, -1.35], [57, 0.35, -1.6], [74, 0.35, -1.6], // 9: ventana
  [76.5, 1.5, -1.35], [80, 1.75, 0.48], [83, 1.75, 0.48], // 12: coge la tetera
  [86.5, 0.36, 0.64], [97, 0.36, 0.64], // 14: sirve
  [100.5, 1.75, 0.48], [103, 1.75, 0.48], // 16: deja la tetera
  [106.5, -0.08, 0.74], [111, -0.08, 0.74], // 18: coge el cruasán
  [115, -1.2, 1.35], [118, -2.2, 1.0], [121, -2.2, 1.0], // 21: apaga la luz
  [126, -4.2, 1.05], [LOOP, -4.2, 1.05],
];
// hacia dónde mira cuando está quieto (índice del tramo)
const HUMAN_FACE = { 2: -Math.PI / 2 - 0.75, 5: Math.PI / 2, 8: Math.PI, 11: Math.PI / 2, 13: Math.PI + 0.05, 15: Math.PI / 2, 17: Math.PI, 20: -Math.PI / 2 - 0.75 };

// --- rata (sale cuando no hay nadie)
const HOLE = [-2.05, -2.18];
export const RAT_PATH = [
  [0, -1.86, -1.96], [13, -1.86, -1.96], [17, -1.7, -1.75], [22, -1.2, -1.1], [26, -0.55, -0.7], // bajo la mesa
  [31, -0.55, -0.7], [34, -1.6, -1.7], [36, -1.9, -2.0], // el humano: huye y se queda asomada
  [128, -1.9, -2.0], [132, -1.5, -1.3], [137, -0.4, 0.2], [142, 0.05, 0.82], // migas
  [152, 0.05, 0.82], [158, 1.25, 1.0], [161, 1.38, 1.02], // la trampa
  [162.2, 1.38, 1.02], [163.2, 1.0, 0.85], // salto atrás
  [170, -1.0, -0.6], [176, HOLE[0], HOLE[1]], [LOOP, HOLE[0], HOLE[1]],
];

// --- mosca: vuela curvas entre puntos de interés (x,y,z)
export const FLY_POINTS = [
  [0, 0.55, 1.35, -2.17], [9, 0.2, 1.8, -2.17], [16, 0.75, 1.55, -2.17], // contra el cristal
  [26, -0.2, 1.4, -1.3], [36, -0.05, 2.02, -0.2], [46, 0.25, 1.95, -0.45], [56, -0.3, 2.0, -0.1], // alrededor de la lámpara
  [66, -0.08, 0.9, 0.06], [92, -0.08, 0.9, 0.06], // sobre el cruasán
  [98, 0.9, 1.6, 0.9], [106, 0.34, 0.89, 0.02], [128, 0.34, 0.89, 0.02], // en el borde de la taza
  [136, -1.0, 1.7, -1.0], [148, 0.6, 1.3, -2.17], [162, 0.1, 1.9, -2.17], [172, 0.8, 1.5, -2.17], [LOOP, 0.55, 1.35, -2.17],
];
const FLY_LANDED = [[66.5, 91.5], [106.5, 127.5]];

const v3 = new THREE.Vector3();

export function flyAt(t, out = new THREE.Vector3()) {
  const P = FLY_POINTS;
  let i = 0;
  while (i < P.length - 2 && t > P[i + 1][0]) i++;
  const a = P[i], b = P[i + 1];
  const k = smooth(a[0], b[0], t);
  out.set(lerp(a[1], b[1], k), lerp(a[2], b[2], k), lerp(a[3], b[3], k));
  const landed = FLY_LANDED.some(([s, e]) => t > s && t < e);
  if (!landed) {
    // vuelo errático de mosca
    out.x += Math.sin(t * 2.3) * 0.12 + Math.sin(t * 7.1) * 0.03;
    out.y += Math.sin(t * 3.1 + 1) * 0.08 + Math.sin(t * 11.3) * 0.015;
    out.z += Math.cos(t * 2.7) * 0.1 + Math.cos(t * 8.9) * 0.025;
    // pegada al cristal: no lo atraviesa
    out.z = Math.max(out.z, -2.2);
  }
  return { pos: out, landed };
}

export function stateAt(t) {
  const h = walkPath(HUMAN_PATH, t);
  const humanIn = t > 33 && t < 126;
  const yaw = h.moving ? h.dir : (HUMAN_FACE[h.i] ?? 0);
  const r = walkPath(RAT_PATH, t);
  const lampOn = t > 39 && t < 120;
  const kettleOn = t > 50 && t < 79;
  const kettleTemp = t < 50 ? 19 : t < 79 ? lerp(19, 100, smooth(50, 77, t)) : lerp(100, 62, smooth(79, LOOP, t));
  const pouring = t > 89 && t < 96;
  const teaLevel = smooth(89.5, 95.5, t);
  const cupTemp = t < 89 ? 20 : lerp(20, 82, smooth(89, 95, t)) - smooth(96, LOOP, t) * 32;
  const carryingKettle = t > 81.5 && t < 102;
  const croissant = t < 109;
  const crumbs = t > 109 ? Math.max(0, 1 - smooth(143, 152, t)) : 0; // la rata se las come
  const door = Math.max(smooth(33, 35.5, t) - smooth(125, 128, t), 0);
  const trapSnapped = t > 162;
  return {
    t, human: { x: h.x, z: h.z, yaw, moving: h.moving, inside: humanIn }, rat: { x: r.x, z: r.z, yaw: r.dir ?? 0, moving: r.moving, visible: !(r.x === HOLE[0] && r.z === HOLE[1]) },
    lampOn, kettleOn, kettleTemp, pouring, teaLevel, cupTemp, carryingKettle, croissant, crumbs, door, trapSnapped,
    switchFlick: (t > 39 && t < 39.4) || (t > 120 && t < 120.4),
  };
}

export function clockString(t) {
  const s = Math.floor(START_CLOCK + t);
  const hh = String(Math.floor(s / 3600) % 24).padStart(2, '0');
  const mm = String(Math.floor(s / 60) % 60).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}
export { HOLE, smooth };
