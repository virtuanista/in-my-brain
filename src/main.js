import * as THREE from 'three';
import { Engine } from './core/engine.js';
import { manager, loadHDR } from './core/assets.js';
import { buildRoom } from './world/room.js';
import { buildKitchen } from './world/kitchen.js';
import { Game } from './game.js';

const engine = new Engine(document.getElementById('view'));
const { scene } = engine;

const loadBar = document.getElementById('loadBar');
const loadLabel = document.getElementById('loadLabel');
manager.onProgress = (url, loaded, total) => {
  loadBar.style.width = `${Math.round((loaded / total) * 100)}%`;
  const n = url.split('/').slice(-2, -1)[0] || '';
  loadLabel.textContent = `Despertando ${n.replaceAll('_', ' ')}…`;
};

async function boot() {
  const pmrem = new THREE.PMREMGenerator(engine.renderer);
  const hdrP = loadHDR('residential_garden_2k').then((hdr) => {
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    scene.background = hdr;
    scene.backgroundIntensity = 1.1;
    scene.environment = pmrem.fromEquirectangular(hdr).texture;
    scene.environmentIntensity = 0.45;
    scene.backgroundRotation.y = 1.2;
    scene.environmentRotation.y = 1.2;
  });
  const room = buildRoom(scene, engine);
  const [kitchen] = await Promise.all([buildKitchen(scene, room), hdrP]);
  const game = new Game(engine, room, kitchen);
  await game.init();
  // precompilar sombreadores para evitar tirones en la primera entrada
  engine.renderer.compile(scene, engine.camera);
  window.__game = game;

  loadBar.style.width = '100%';
  loadLabel.textContent = '';
  setTimeout(() => game.start(), 600);

  const clock = new THREE.Clock();
  engine.renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 1 / 20);
    game.update(dt);
    engine.render(dt);
  });
}

boot().catch((e) => {
  console.error(e);
  loadLabel.textContent = 'Algo no ha despertado: ' + e.message;
});
