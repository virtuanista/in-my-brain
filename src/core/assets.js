import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';

export const ASSETS = `${import.meta.env.BASE_URL}assets/`;
export const manager = new THREE.LoadingManager();

// Build de un solo archivo: los assets vienen incrustados en window.__ASSETS (ruta relativa -> base64).
// Se convierten a blob: bajo demanda, así el juego abre con doble clic sin servidor.
if (typeof window !== 'undefined' && window.__ASSETS) {
  const blobs = new Map();
  const MIME = { jpg: 'image/jpeg', png: 'image/png', gltf: 'model/gltf+json', bin: 'application/octet-stream', glb: 'model/gltf-binary', hdr: 'application/octet-stream' };
  manager.setURLModifier((url) => {
    const i = url.indexOf('assets/');
    if (i < 0) return url;
    const key = decodeURIComponent(url.slice(i + 7).split('?')[0]);
    if (blobs.has(key)) return blobs.get(key);
    const b64 = window.__ASSETS[key];
    if (!b64) { console.warn('asset no incrustado', key); return url; }
    {
      const bin = atob(b64), arr = new Uint8Array(bin.length);
      for (let j = 0; j < bin.length; j++) arr[j] = bin.charCodeAt(j);
      blobs.set(key, URL.createObjectURL(new Blob([arr], { type: MIME[key.split('.').pop()] || 'application/octet-stream' })));
      delete window.__ASSETS[key];
    }
    return blobs.get(key);
  });
}
const gltf = new GLTFLoader(manager);
const texLoader = new THREE.TextureLoader(manager);
const cache = new Map();

export function loadModel(name, file = `${name}.gltf`) {
  const url = `${ASSETS}models/${name}/${file}`;
  if (!cache.has(url)) cache.set(url, gltf.loadAsync(url));
  return cache.get(url);
}

export function loadHDR(name) {
  return new RGBELoader(manager).loadAsync(`${ASSETS}hdri/${name}.hdr`);
}

/** Set PBR de Poly Haven (diff / nor / arm) con repetición en metros. */
export function pbr(name, { repeat = [1, 1], color = 0xffffff, normalScale = 1, roughness = 1, envMapIntensity = 1, aniso = 8 } = {}) {
  const base = `${ASSETS}textures/${name}/`;
  const setup = (t, srgb) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
    t.anisotropy = aniso;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const map = setup(texLoader.load(base + 'diff.jpg'), true);
  const normalMap = setup(texLoader.load(base + 'nor.jpg'), false);
  const arm = setup(texLoader.load(base + 'arm.jpg'), false);
  return new THREE.MeshStandardMaterial({
    map, normalMap, normalScale: new THREE.Vector2(normalScale, normalScale),
    aoMap: arm, roughnessMap: arm, metalnessMap: arm, metalness: 1, roughness, color, envMapIntensity,
  });
}

/** Clona un nodo concreto de un glTF (los packs de Poly Haven traen varias piezas). */
export function pickNode(gltfScene, name) {
  const n = gltfScene.getObjectByName(name);
  if (!n) throw new Error('Nodo no encontrado: ' + name);
  const c = n.clone(true);
  c.position.set(0, 0, 0);
  return c;
}

export function prepare(obj, { cast = true, receive = true } = {}) {
  obj.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = cast;
      o.receiveShadow = receive;
      if (o.material) {
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        ms.forEach((m) => {
          if (m.map) m.map.anisotropy = 8;
          if (m.alphaTest > 0) { m.side = THREE.DoubleSide; o.castShadow = cast; }
        });
      }
    }
  });
  return obj;
}
