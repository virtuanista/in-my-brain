import * as THREE from 'three';
import { DOT } from '../world/actors.js';

const beamCommon = /* glsl */ `
  uniform vec3 uSunDir; uniform vec4 uWin; // cx, y0, y1, halfW
  uniform float uWinZ;
  // ¿este punto recibe sol directo a través de la ventana? (ignora oclusiones)
  vec3 beamCoord(vec3 p){
    float s = (uWinZ - p.z) / uSunDir.z; // retroceder por el rayo hasta el plano de la ventana
    vec3 q = p + uSunDir * s;            // s < 0: desde dentro de la sala hacia atrás
    float u = (q.x - uWin.x) / uWin.w;
    float v = (q.y - uWin.y) / (uWin.z - uWin.y);
    return vec3(u, v, -s);
  }
  float beamMask(vec3 bc){
    float e = smoothstep(1.0, 0.86, abs(bc.x)) * smoothstep(0.0, 0.06, bc.y) * smoothstep(1.0, 0.94, bc.y);
    // sombra de los parteluces
    e *= 1.0 - 0.85 * smoothstep(0.03, 0.0, abs(bc.x)) ;
    e *= 1.0 - 0.85 * smoothstep(0.025, 0.0, abs(bc.y - 0.62));
    return e * step(0.0, bc.z);
  }
`;

export const BEAM_GLSL = beamCommon;

export function buildAtmosphere(scene, { sunDir, win, winZ, room }) {
  const uniforms = {
    uSunDir: { value: sunDir.clone() }, uWin: { value: new THREE.Vector4(win.cx, win.y0, win.y1, win.w / 2) }, uWinZ: { value: winZ },
    uT: { value: 0 }, uIntensity: { value: 1 }, map: { value: DOT }, uPx: { value: 1 }, uDustBoost: { value: 1 },
  };

  // ---- motas de polvo: visibles sobre todo dentro del haz
  const N = 2600;
  const pos = new Float32Array(N * 3), seeds = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = THREE.MathUtils.lerp(room.x0 + 0.1, room.x1 - 0.1, Math.random());
    pos[i * 3 + 1] = Math.random() * 2.7 + 0.05;
    pos[i * 3 + 2] = THREE.MathUtils.lerp(room.z0 + 0.1, room.z1 - 0.1, Math.random());
    seeds[i] = Math.random();
  }
  const dg = new THREE.BufferGeometry();
  dg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  dg.setAttribute('seed', new THREE.BufferAttribute(seeds, 1));
  const dustMat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: beamCommon + /* glsl */ `
      attribute float seed; uniform float uT, uPx, uDustBoost; varying float vA;
      void main(){
        vec3 p = position;
        float s = seed * 100.;
        p += vec3(sin(uT*0.11 + s), sin(uT*0.07 + s*1.3) * 0.6 - 0.02*uT*0.0, cos(uT*0.09 + s*0.7)) * 0.12;
        p.y = mod(p.y - uT * 0.004 * (0.5 + seed), 2.75) + 0.02;
        vec3 bc = beamCoord(p);
        float lit = beamMask(bc);
        vec4 mv = modelViewMatrix * vec4(p,1.);
        gl_Position = projectionMatrix * mv;
        float tw = 0.6 + 0.4 * sin(uT * (1.0 + seed * 3.0) + s);
        gl_PointSize = clamp((0.0016 + seed * 0.0016) * uPx * 1100.0 / -mv.z, 1.0, 64.0);
        vA = (lit * 1.0 + 0.035) * tw * uDustBoost * smoothstep(0.02, 0.15, -mv.z);
      }`,
    fragmentShader: `uniform sampler2D map; varying float vA; void main(){ float a = texture2D(map, gl_PointCoord).a; gl_FragColor = vec4(vec3(1.0,0.9,0.72) * 2.2, a * vA); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const dust = new THREE.Points(dg, dustMat);
  dust.frustumCulled = false;
  scene.add(dust);

  return { dust, uniforms };
}
