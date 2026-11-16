import * as THREE from 'three';
import { BEAM_GLSL } from './atmosphere.js';

/**
 * Visión térmica: sustituye temporalmente los materiales por emisores de temperatura.
 * Lo que la taza "ve": el humano es una hoguera, la ventana un espejo frío, el cielo no existe.
 */
const vert = /* glsl */ `
#include <common>
#include <skinning_pars_vertex>
varying vec3 vN; varying vec3 vW; varying vec3 vV; varying vec2 vUv;
void main(){
  vUv = uv;
  #include <skinbase_vertex>
  #include <begin_vertex>
  #include <beginnormal_vertex>
  #include <skinnormal_vertex>
  #include <skinning_vertex>
  vec4 w = modelMatrix * vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    w = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
  #endif
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * objectNormal);
  vV = normalize(cameraPosition - w.xyz);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const frag = /* glsl */ `
${BEAM_GLSL}
uniform float uTemp, uT, uUseAlpha; uniform sampler2D uAlphaMap;
varying vec3 vN; varying vec3 vW; varying vec3 vV; varying vec2 vUv;
vec3 ironbow(float t){
  t = clamp(t, 0., 1.);
  vec3 c0 = vec3(.02,.0,.08), c1 = vec3(.28,.03,.5), c2 = vec3(.8,.12,.33), c3 = vec3(.99,.47,.06), c4 = vec3(1.,.9,.45), c5 = vec3(1.);
  if (t < .2) return mix(c0,c1,t/.2);
  if (t < .45) return mix(c1,c2,(t-.2)/.25);
  if (t < .7) return mix(c2,c3,(t-.45)/.25);
  if (t < .9) return mix(c3,c4,(t-.7)/.2);
  return mix(c4,c5,(t-.9)/.1);
}
float h3(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
void main(){
  if (uUseAlpha > .5 && texture2D(uAlphaMap, vUv).a < .5) discard;
  float T = uTemp;
  // el aire caliente sube: todo es algo más cálido cerca del techo
  T += (uTemp < 26. ? vW.y * 1.4 - 1.5 : 0.);
  // el sol calienta lo que toca
  float sunlit = beamMask(beamCoord(vW)) * max(dot(normalize(vN), -uSunDir), 0.);
  T += sunlit * 7.0;
  // los cuerpos calientes irradian más en sus bordes visibles de frente
  float fr = max(dot(normalize(vN), normalize(vV)), 0.);
  T += (uTemp > 30. ? (fr - .5) * 4. : 0.);
  // las superficies se 'leen' por su emisividad: de frente brillan un poco más
  T += (fr - .6) * 2.5;
  // radiadores de calor que suben
  T += (uTemp > 45. ? sin(vW.y * 60. - uT * 4.) * 1.5 : 0.);
  float n = (T - 16.5) / 60.;
  n = pow(clamp(n, 0., 1.), .8);
  vec3 c = ironbow(n);
  c *= .85 + .15 * h3(floor(vW * 120.));
  gl_FragColor = vec4(c * (0.8 + n * 1.2), 1.0);
}`;

export class Thermal {
  constructor(scene) {
    this.scene = scene;
    this.active = false;
    this.saved = new Map();
    this.temps = new Map(); // mesh -> () => temp
    this.mats = new Set();
    this.uniformsShared = {
      uT: { value: 0 }, uSunDir: { value: new THREE.Vector3() }, uWin: { value: new THREE.Vector4() }, uWinZ: { value: 0 },
    };
  }

  /** asigna una temperatura (número o función) a todas las mallas de un objeto */
  setTemp(obj, temp) { obj.traverse((o) => { if (o.isMesh || o.isInstancedMesh) this.temps.set(o, temp); }); }

  makeMat(src) {
    const u = {
      ...this.uniformsShared, uTemp: { value: 20 }, uUseAlpha: { value: 0 }, uAlphaMap: { value: null },
    };
    if (src && src.alphaTest > 0 && src.map) { u.uUseAlpha.value = 1; u.uAlphaMap.value = src.map; }
    const m = new THREE.ShaderMaterial({ uniforms: u, vertexShader: vert, fragmentShader: frag, side: src?.alphaTest > 0 ? THREE.DoubleSide : THREE.FrontSide });
    this.mats.add(m);
    return m;
  }

  enable(skip = []) {
    if (this.active) return;
    this.active = true;
    this.savedBg = this.scene.background;
    this.scene.background = new THREE.Color(0x05010d); // el cielo está frío y lejos
    this.scene.traverse((o) => {
      if (!(o.isMesh || o.isInstancedMesh) || skip.includes(o)) return;
      if (o.userData.noThermal) { this.saved.set(o, { vis: o.visible, mat: o.material }); o.visible = false; return; }
      this.saved.set(o, { mat: o.material, vis: o.visible });
      const src = Array.isArray(o.material) ? o.material[0] : o.material;
      const m = this.makeMat(src);
      o.material = m;
      if (o.userData.thermalVisible) o.visible = true;
    });
  }

  disable() {
    if (!this.active) return;
    this.active = false;
    this.scene.background = this.savedBg;
    for (const [o, s] of this.saved) { o.material = s.mat; o.visible = s.vis; }
    this.saved.clear();
    this.mats.forEach((m) => m.dispose());
    this.mats.clear();
  }

  update(t, ambient = 20) {
    this.uniformsShared.uT.value = t;
    if (!this.active) return;
    for (const [o] of this.saved) {
      if (!o.material.uniforms) continue;
      const f = this.temps.get(o);
      o.material.uniforms.uTemp.value = f === undefined ? ambient : typeof f === 'function' ? f() : f;
    }
  }
}
