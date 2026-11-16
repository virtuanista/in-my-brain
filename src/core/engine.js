import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { PerceptionPass } from '../fx/perception.js';
import { TrailPass } from '../fx/trails.js';

/**
 * Renderer + cadena de postproceso.
 * Escena -> GTAO (oclusión ambiental) -> estelas temporales -> percepción de la mente -> bloom -> tonemapping.
 */
export class Engine {
  constructor(canvas) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.AgXToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.02, 60);

    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    const composer = new EffectComposer(renderer, rt);
    this.composer = composer;

    this.renderPass = new RenderPass(this.scene, this.camera);
    composer.addPass(this.renderPass);

    this.gtao = new GTAOPass(this.scene, this.camera, size.x, size.y);
    this.gtao.output = GTAOPass.OUTPUT.Default;
    this.gtao.blendIntensity = 0.85;
    this.gtao.updateGtaoMaterial({ radius: 0.35, distanceExponent: 1.6, thickness: 1.2, scale: 1.0, samples: 12, distanceFallOff: 1.0 });
    this.gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
    // los objetos transparentes / fantasmas no deben ensuciar la AO ni el DOF
    this.aoHidden = [];
    const origRender = this.gtao.render.bind(this.gtao);
    this.gtao.render = (...args) => {
      const prev = this.aoHidden.map((o) => o.visible);
      this.aoHidden.forEach((o) => (o.visible = false));
      // la AO sólo necesita recalcular normales en su propio pase
      origRender(...args);
      this.aoHidden.forEach((o, i) => (o.visible = prev[i]));
    };
    composer.addPass(this.gtao);

    this.trails = new TrailPass(size.x, size.y);
    composer.addPass(this.trails);

    this.perception = new PerceptionPass(this.gtao.depthTexture, this.camera);
    composer.addPass(this.perception);

    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.35, 0.6, 0.92);
    composer.addPass(this.bloom);

    composer.addPass(new OutputPass());

    window.addEventListener('resize', () => this.resize());
  }

  hideFromAO(obj) { this.aoHidden.push(obj); }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    const s = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.perception.setSize(s.x, s.y);
    this.trails.setSize(s.x, s.y);
  }

  render(dt) {
    this.perception.camera = this.camera;
    this.gtao.camera = this.camera;
    this.renderPass.camera = this.camera;
    this.composer.render(dt);
  }
}
