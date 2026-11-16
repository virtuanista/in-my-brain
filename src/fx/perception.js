import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { BEAM_GLSL } from './atmosphere.js';

/** Modos de percepción: cada mente "ve" la misma luz de forma distinta. */
export const MODE = {
  SPIRIT: 0, FLY: 1, RAT: 2, THERMAL: 3, GLASS: 4, PLANT: 5, CLOCK: 6, BULB: 7,
  SPECTACLES: 8, BOTTLE: 9, HUMAN: 10, OBJECT: 11, MEMORY: 12, TRAP: 13, KETTLE: 14,
};

const frag = () => /* glsl */ `
precision highp float;
#include <packing>
${BEAM_GLSL}
uniform mat4 uInvProj, uCamWorld; uniform float uBeam;
uniform sampler2D tDiffuse, tDepth, tFog;
uniform vec2 uRes;
uniform float uTime, uTrans, cameraNear, cameraFar, uFocus, uAperture, uVignette, uGrain, uSat, uFisheye, uHeat, uLight, uAlert, uExposure, uTick;
uniform int uMode;
uniform vec3 uTint;
uniform vec4 uParam;
uniform vec4 uRipples[8];
varying vec2 vUv;

const float PI = 3.14159265;

float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.-2.*f);
  return mix(mix(hash12(i), hash12(i+vec2(1,0)), u.x), mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), u.x), u.y); }
float fbm(vec2 p){ float a = .5, s = 0.; for(int i=0;i<4;i++){ s += a*noise(p); p *= 2.03; a *= .5; } return s; }
float luma(vec3 c){ return dot(c, vec3(.2126,.7152,.0722)); }

float linDepth(vec2 uv){
  float d = texture2D(tDepth, uv).x;
  return -perspectiveDepthToViewZ(d, cameraNear, cameraFar);
}

vec2 barrel(vec2 uv, float k){
  vec2 c = uv - .5; c.x *= uRes.x/uRes.y;
  float r2 = dot(c,c);
  c *= 1. + k*r2;
  c.x /= uRes.x/uRes.y;
  return c + .5;
}

// desenfoque de profundidad (gather en espiral áurea)
vec3 dofSample(vec2 uv, float focus, float aperture, float maxR){
  vec3 base = texture2D(tDiffuse, uv).rgb;
  if (aperture <= 0.0) return base;
  float z = linDepth(uv);
  float coc = clamp(abs(z - focus) / max(z, 1e-4) * aperture, 0., maxR);
  if (coc < .6) return base;
  vec3 acc = base; float w = 1.;
  const int N = 28;
  for (int i = 1; i < N; i++){
    float fi = float(i);
    float r = sqrt(fi / float(N)) * coc;
    float a = fi * 2.39996323;
    vec2 o = vec2(cos(a), sin(a)) * r / uRes;
    vec2 suv = uv + o;
    float zs = linDepth(suv);
    float cs = clamp(abs(zs - focus) / max(zs, 1e-4) * aperture, 0., maxR);
    // evita que lo enfocado delante sangre sobre el fondo
    float wt = smoothstep(r - 1.5, r + .5, max(cs, zs < z ? cs : coc));
    vec3 s = texture2D(tDiffuse, suv).rgb;
    // bokeh: las luces altas pesan más
    wt *= 1. + luma(s) * 1.5;
    acc += s * wt; w += wt;
  }
  return acc / w;
}

vec3 saturate3(vec3 c, float s){ return mix(vec3(luma(c)), c, s); }

vec3 ironbow(float t){
  t = clamp(t, 0., 1.);
  vec3 c0 = vec3(.02,.0,.06), c1 = vec3(.25,.02,.45), c2 = vec3(.78,.1,.32), c3 = vec3(.98,.45,.05), c4 = vec3(1.,.9,.45), c5 = vec3(1.);
  if (t < .2) return mix(c0,c1,t/.2);
  if (t < .45) return mix(c1,c2,(t-.2)/.25);
  if (t < .7) return mix(c2,c3,(t-.45)/.25);
  if (t < .9) return mix(c3,c4,(t-.7)/.2);
  return mix(c4,c5,(t-.9)/.1);
}

// ---------- ojo compuesto ----------
vec2 hexCenter(vec2 p, out vec2 local){
  const vec2 s = vec2(1., 1.7320508);
  vec4 hC = floor(vec4(p, p - vec2(.5, 1.)) / s.xyxy) + .5;
  vec4 h = vec4(p - hC.xy*s, p - (hC.zw + .5)*s);
  if (dot(h.xy,h.xy) < dot(h.zw,h.zw)) { local = h.xy; return hC.xy*s; }
  local = h.zw; return (hC.zw + .5)*s;
}

// haz de sol volumétrico: integra la luz que atraviesa la ventana hasta la profundidad de la escena
vec3 sunShaft(vec2 uv){
  if (uBeam <= 0.) return vec3(0.);
  vec4 v = uInvProj * vec4(uv * 2. - 1., 1., 1.);
  vec3 dv = normalize(v.xyz / v.w);
  float zl = min(linDepth(uv), 9.0);
  float tEnd = zl / max(-dv.z, 1e-3);
  vec3 ro = (uCamWorld * vec4(0.,0.,0.,1.)).xyz;
  vec3 rd = normalize(mat3(uCamWorld) * dv);
  float j = hash12(gl_FragCoord.xy + fract(uTime) * 17.);
  float acc = 0.;
  for (int i = 0; i < 14; i++){
    float tt = tEnd * (float(i) + j) / 14.;
    vec3 p = ro + rd * tt;
    if (p.z < uWinZ) break;
    vec3 bc = beamCoord(p);
    float m = beamMask(bc);
    float d = .6 + .4 * noise(p.xy * 4. + vec2(uTime * .04, 0.)) * noise(p.zy * 3. - uTime * .03);
    acc += m * d * exp(-bc.z * .22);
  }
  return vec3(1., .84, .6) * acc / 14. * min(tEnd, 4.) * .15 * uBeam;
}

void main(){
  vec2 uv = vUv;
  float aspect = uRes.x / uRes.y;
  vec3 col;
  float vig = uVignette;

  // transición de entrada: el mundo se deshace en remolino y se rehace
  if (uTrans > 0.001){
    vec2 c = uv - .5; c.x *= aspect;
    float r = length(c);
    float ang = uTrans * uTrans * 3.5 * (1. - r);
    c = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * c * (1. - uTrans*.35);
    c.x /= aspect; uv = c + .5;
  }

  if (uFisheye != 0.) uv = barrel(uv, uFisheye);

  if (uMode == 1) {
    // MOSCA: miles de facetas, cada una un único píxel de mundo
    vec2 p = vec2(uv.x * aspect, uv.y) * uParam.x;
    vec2 local; vec2 hc = hexCenter(p, local);
    vec2 cuv = vec2(hc.x / aspect, hc.y) / uParam.x;
    vec2 luv = cuv + vec2(local.x/aspect, local.y) / uParam.x * .55;
    vec3 a = texture2D(tDiffuse, cuv).rgb;
    vec3 b = texture2D(tDiffuse, luv).rgb;
    col = mix(a, b, .45);
    float edge = smoothstep(.36, .5, length(local)*1.05);
    float facetVar = .88 + .24*hash12(hc);
    col *= facetVar * (1. - edge*.65);
    // sensibilidad al ultravioleta: los blancos viran a violeta
    col = mix(col, col * vec3(.82,.86,1.25), smoothstep(.4, 1.2, luma(col)));
    col += vec3(.03,.02,.06) * (1. - edge);
    col = saturate3(col, .75);
  }
  else if (uMode == 2) {
    // RATA: casi daltónica, miope, pero el mundo cercano se dibuja en bigotes
    col = dofSample(uv, uFocus, uAperture, 18.);
    col = vec3(.567*col.r + .433*col.g, .558*col.r + .442*col.g, .242*col.g + .758*col.b);
    col = pow(col * 1.15, vec3(.92));
    float z = linDepth(uv);
    vec2 px = 1.5 / uRes;
    // discontinuidades de profundidad (bordes reales), no la pendiente del suelo
    float lx = abs(linDepth(uv+vec2(px.x,0.)) + linDepth(uv-vec2(px.x,0.)) - 2.*z);
    float ly = abs(linDepth(uv+vec2(0.,px.y)) + linDepth(uv-vec2(0.,px.y)) - 2.*z);
    float near = 1. - smoothstep(.05, .5, z);
    float whisk = smoothstep(.01, .06, (lx + ly) / max(z, .01)) * near;
    float pulse = .6 + .4*sin(uTime*9. - z*40.);
    col += vec3(.55,.75,1.) * whisk * pulse * .35;
    col = mix(col, col*vec3(.9,1.,1.05), .5);
    vig = max(vig, .55);
  }
  else if (uMode == 3 || uMode == 14) {
    // TÉRMICO: los materiales ya emiten temperatura; aquí el ruido del sensor
    vec2 duv = uv;
    if (uMode == 14) {
      float rise = uTime * (.25 + uHeat*.8);
      vec2 n = vec2(fbm(uv*vec2(6.,3.) - vec2(0., rise)), fbm(uv*vec2(6.,3.) + 7.3 - vec2(0., rise)));
      duv += (n - .5) * (.004 + uHeat * .028);
    }
    col = dofSample(duv, uFocus, uAperture, 10.);
    col = col * col * 1.5;
    float sn = (hash12(gl_FragCoord.xy + fract(uTime)*91.) - .5) * .03;
    col += sn;
    col *= .96 + .04*sin(gl_FragCoord.y*1.2);
    if (uMode == 14) {
      // vapor que empaña cuando hierve
      float steam = fbm(uv*vec2(3.,2.) - vec2(0., uTime*.35)) * smoothstep(.55, 1., uHeat);
      col = mix(col, vec3(1., .96, .9), steam * .55 * smoothstep(1., .2, uv.y));
    }
  }
  else if (uMode == 4) {
    // CRISTAL: siente cada sonido como onda; el vaho le nubla la mirada
    vec2 off = vec2(0.);
    for (int i = 0; i < 8; i++){
      vec4 r = uRipples[i];
      float age = uTime - r.z;
      if (age < 0. || age > 4. || r.w <= 0.) continue;
      vec2 d = uv - r.xy; d.x *= aspect;
      float dist = length(d);
      float wave = sin(dist*70. - age*22.) * exp(-age*1.4) * exp(-dist*3.) * r.w;
      off += normalize(d + 1e-5) * wave * .012;
    }
    // vidrio antiguo: ligeramente ondulado
    off += (vec2(fbm(uv*3.1), fbm(uv*3.1+5.)) - .5) * .012;
    vec2 suv = uv + off;
    float fog = texture2D(tFog, uv).r * smoothstep(.25, .75, fbm(uv * vec2(2.5, 3.5) + 3.1));
    vec3 sharp;
    sharp.r = texture2D(tDiffuse, suv + off*.6 + vec2(.0015,0.)).r;
    sharp.g = texture2D(tDiffuse, suv).g;
    sharp.b = texture2D(tDiffuse, suv - off*.6 - vec2(.0015,0.)).b;
    vec3 blur = vec3(0.);
    for (int i = 0; i < 16; i++){ float a = float(i)*2.39996; float rr = sqrt(float(i)/16.)*.035;
      blur += texture2D(tDiffuse, suv + vec2(cos(a), sin(a))*rr*vec2(1./aspect,1.)).rgb; }
    blur /= 16.;
    // gotas en el vaho
    vec2 g = uv*vec2(aspect,1.)*38.; vec2 gi = floor(g); vec2 gf = fract(g) - .5;
    float drop = smoothstep(.16, .04, length(gf + (vec2(hash12(gi), hash12(gi+3.)) - .5)*.5)) * step(.93, hash12(gi*1.7)) * fog;
    col = mix(sharp, blur + vec3(.035,.04,.045), fog*.8);
    col += drop * .06;
    col = mix(col, col*vec3(.92,1.02,1.04), .6);
  }
  else if (uMode == 5) {
    // PLANTA: sólo existe la luz. Lo oscuro es casi nada.
    col = dofSample(uv, uFocus, uAperture, 12.);
    float L = luma(col);
    float hunger = smoothstep(.08, .9, L);
    vec3 lightCol = mix(vec3(.05,.12,.06), vec3(1.,.93,.6), hunger);
    col = mix(col*.3, lightCol * (L*1.3), .7);
    col += vec3(.2,.9,.35) * pow(hunger, 3.) * .25;
    vig = max(vig, .6);
  }
  else if (uMode == 6) {
    // RELOJ: todo es pasado acumulado; cada segundo es un latido
    col = dofSample(uv, uFocus, uAperture, 8.);
    float L = luma(col);
    col = mix(vec3(L)*vec3(1.05,.92,.72), col, .25);
    vec2 c = uv - .5; c.x *= aspect;
    float r = length(c);
    float beat = exp(-fract(uTick)*7.);
    col *= 1. + beat * .25 * smoothstep(.6, 0., r);
    float ring = smoothstep(.006, 0., abs(r - fract(uTick)*.9)) * (1.-fract(uTick));
    col += vec3(1.,.8,.5) * ring * .06;
  }
  else if (uMode == 7) {
    // BOMBILLA
    col = texture2D(tDiffuse, uv).rgb;
    vec2 c = uv - .5; c.x *= aspect; float r = length(c);
    if (uLight > .5) {
      col = 1. - exp(-col * 3.2);
      col = mix(col, vec3(1.,.95,.85), smoothstep(.45, 0., r) * .35);
      col *= vec3(1.,.93,.8);
    } else {
      col *= .06;
      float fil = exp(-r*9.) * (.6 + .4*sin(uTime*3.));
      col += vec3(1.,.45,.12) * fil * .35;
    }
  }
  else if (uMode == 8) {
    // GAFAS: sólo dos círculos del mundo están nítidos, y ampliados
    vec2 c = uv - .5; c.x *= aspect;
    vec2 l1 = vec2(-.25, 0.), l2 = vec2(.25, 0.);
    float R = .215;
    float d1 = length(c - l1), d2 = length(c - l2);
    float inL = max(smoothstep(R, R-.01, d1), smoothstep(R, R-.01, d2));
    vec2 lc = d1 < d2 ? l1 : l2;
    vec2 mc = lc + (c - lc) / 1.35;
    vec2 muv = vec2(mc.x/aspect, mc.y) + .5;
    vec3 sharp = texture2D(tDiffuse, muv).rgb;
    vec3 bl = vec3(0.);
    for (int i = 0; i < 20; i++){ float a = float(i)*2.39996; float rr = sqrt(float(i)/20.)*.03;
      bl += texture2D(tDiffuse, uv + vec2(cos(a)/aspect, sin(a))*rr).rgb; }
    bl /= 20.;
    col = mix(bl*.7, sharp*1.04, inL);
    float rim = smoothstep(.008, 0., abs(min(d1,d2) - R));
    col = mix(col, vec3(.85,.7,.4)*.6, rim);
    // reflejo en el cristal
    col += vec3(1.) * .06 * smoothstep(.14, .0, length(c - lc - vec2(-.08, .09))) * inL;
  }
  else if (uMode == 9) {
    // BOTELLA: el mundo curvado en verde
    vec2 w = vec2(sin(uv.y*9. + uTime*1.3), cos(uv.x*7. + uTime)) * .006;
    col = texture2D(tDiffuse, uv + w).rgb;
    col = col * uTint * 1.4;
    float band = smoothstep(.04, 0., abs(uv.x - .28)) + smoothstep(.02, 0., abs(uv.x - .74))*.6;
    col += vec3(.7,1.,.75) * band * .1;
  }
  else if (uMode == 12) {
    // MEMORIA (el cuadro): cuarenta años mirando la misma cocina
    vec2 j = vec2(0., (hash12(vec2(floor(uTime*12.))) - .5) * .002);
    col = dofSample(uv + j, uFocus, uAperture, 8.);
    float L = luma(col);
    col = vec3(L*1.08, L*.95, L*.74);
    col *= .9 + .1*hash12(vec2(floor(uTime*24.)));
    float scr = step(.996, hash12(vec2(floor(uv.x*300.), floor(uTime*18.)))) * .35;
    col += scr;
    col += (hash12(gl_FragCoord.xy + uTime) - .5) * .09;
    vig = max(vig, .9);
  }
  else if (uMode == 13) {
    // TRAMPA: toda ella es tensión, esperando
    col = dofSample(uv, uFocus, uAperture, 10.);
    col = saturate3(col, .4);
    col = pow(col, vec3(1.15));
    vec2 c = uv - .5; c.x *= aspect; float r = length(c);
    float tunnel = smoothstep(.25, .75, r);
    float pulse = .5 + .5*sin(uTime*(3. + uAlert*10.));
    col = mix(col, vec3(.5,.04,.02)*(.4+pulse*.6), tunnel * (.35 + uAlert*.55));
  }
  else {
    // espíritu, humano y objetos: óptica "normal" con matices
    col = dofSample(uv, uFocus, uAperture, 14.);
    col = mix(col, col * uTint, .65);
    col = saturate3(col, uSat);
  }

  col += sunShaft(uv);
  col *= uExposure;
  vec2 vc = vUv - .5; vc.x *= aspect * .8;
  col *= mix(1., smoothstep(.95, .2, length(vc)), vig);
  col += (hash12(gl_FragCoord.xy + fract(uTime*7.)*313.) - .5) * uGrain;

  if (uTrans > 0.001) {
    col = mix(col, vec3(luma(col))*vec3(1.1,1.,.9), uTrans*.6);
    col += vec3(1.,.9,.75) * pow(uTrans, 4.) * .6;
  }
  gl_FragColor = vec4(max(col, 0.), 1.);
}
`;

export class PerceptionPass extends Pass {
  constructor(depthTexture, camera) {
    super();
    this.camera = camera;
    const ripples = [];
    for (let i = 0; i < 8; i++) ripples.push(new THREE.Vector4(0, 0, -99, 0));
    this.uniforms = {
      tDiffuse: { value: null }, tDepth: { value: depthTexture }, tFog: { value: null },
      uRes: { value: new THREE.Vector2(1, 1) }, uTime: { value: 0 }, uTrans: { value: 0 },
      cameraNear: { value: 0.1 }, cameraFar: { value: 50 },
      uFocus: { value: 2 }, uAperture: { value: 0 }, uVignette: { value: .35 }, uGrain: { value: .025 },
      uSat: { value: 1 }, uFisheye: { value: 0 }, uHeat: { value: 0 }, uLight: { value: 0 }, uAlert: { value: 0 },
      uExposure: { value: 1 }, uTick: { value: 0 },
      uMode: { value: 0 }, uTint: { value: new THREE.Vector3(1, 1, 1) }, uParam: { value: new THREE.Vector4(90, 0, 0, 0) },
      uRipples: { value: ripples },
      uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() }, uBeam: { value: 1 },
      uSunDir: { value: new THREE.Vector3(0, -1, 1).normalize() }, uWin: { value: new THREE.Vector4() }, uWinZ: { value: -2.25 },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: frag(), depthTest: false, depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.material);
    this.rippleIdx = 0;
  }

  setSize(w, h) { this.uniforms.uRes.value.set(w, h); }

  addRipple(u, v, time, strength = 1) {
    this.uniforms.uRipples.value[this.rippleIdx].set(u, v, time, strength);
    this.rippleIdx = (this.rippleIdx + 1) % 8;
  }

  render(renderer, writeBuffer, readBuffer) {
    this.uniforms.tDiffuse.value = readBuffer.texture;
    this.uniforms.cameraNear.value = this.camera.near;
    this.uniforms.cameraFar.value = this.camera.far;
    this.uniforms.uInvProj.value.copy(this.camera.projectionMatrixInverse);
    this.uniforms.uCamWorld.value.copy(this.camera.matrixWorld);
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }
}
