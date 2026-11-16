import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

/**
 * Persistencia temporal: mezcla el fotograma actual con los anteriores.
 * La planta (time-lapse) y el reloj (ecos del tiempo) ven el pasado superpuesto.
 */
export class TrailPass extends Pass {
  constructor(w, h) {
    super();
    const opts = { type: THREE.HalfFloatType, depthBuffer: false };
    this.a = new THREE.WebGLRenderTarget(w, h, opts);
    this.b = new THREE.WebGLRenderTarget(w, h, opts);
    this.amount = 0; // 0 = sin estela
    this.mode = 0; // 0 mezcla suave, 1 ecos (máximo)
    this.material = new THREE.ShaderMaterial({
      uniforms: { tCur: { value: null }, tPrev: { value: null }, uAmount: { value: 0 }, uMode: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tCur, tPrev; uniform float uAmount; uniform int uMode; varying vec2 vUv;
        void main(){
          vec4 c = texture2D(tCur, vUv);
          vec4 p = texture2D(tPrev, vUv);
          vec3 o;
          if (uMode == 1) {
            // ecos: el pasado persiste como fantasma luminoso que se apaga
            o = max(c.rgb, p.rgb * uAmount * 0.985);
            o = mix(c.rgb, o, 0.72);
          } else {
            o = mix(c.rgb, p.rgb, uAmount);
          }
          gl_FragColor = vec4(o, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    this.copy = new THREE.ShaderMaterial({
      uniforms: { t: { value: null } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: `uniform sampler2D t; varying vec2 vUv; void main(){ gl_FragColor = texture2D(t, vUv); }`,
      depthTest: false, depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.material);
    this.reset = true;
  }

  setSize(w, h) { this.a.setSize(w, h); this.b.setSize(w, h); this.reset = true; }

  render(renderer, writeBuffer, readBuffer) {
    if (this.amount <= 0.001) {
      // pasa tal cual pero mantiene el buffer al día para que la estela no arranque en negro
      this.quad.material = this.copy;
      this.copy.uniforms.t.value = readBuffer.texture;
      renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
      this.quad.render(renderer);
      this.reset = true;
      return;
    }
    if (this.reset) {
      this.quad.material = this.copy;
      this.copy.uniforms.t.value = readBuffer.texture;
      renderer.setRenderTarget(this.b);
      this.quad.render(renderer);
      this.reset = false;
    }
    this.quad.material = this.material;
    this.material.uniforms.tCur.value = readBuffer.texture;
    this.material.uniforms.tPrev.value = this.b.texture;
    this.material.uniforms.uAmount.value = this.amount;
    this.material.uniforms.uMode.value = this.mode;
    renderer.setRenderTarget(this.a);
    this.quad.render(renderer);
    // a -> salida
    this.quad.material = this.copy;
    this.copy.uniforms.t.value = this.a.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
    [this.a, this.b] = [this.b, this.a];
  }
}
