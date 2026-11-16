import * as THREE from 'three';
import { loadModel, pickNode, prepare } from '../core/assets.js';
import { ROOM, WINDOW } from './room.js';

const ray = new THREE.Raycaster();
const DOWN = new THREE.Vector3(0, -1, 0);

/** Altura de la superficie más alta bajo (x,z) por debajo de fromY. */
export function surfaceAt(objs, x, z, fromY = 3) {
  ray.set(new THREE.Vector3(x, fromY, z), DOWN);
  ray.far = fromY + 1;
  const hit = ray.intersectObjects(objs, true)[0];
  return hit ? hit.point.y : 0;
}

/** Apoya un objeto sobre y, centrado en x,z según su caja. */
function put(scene, obj, x, y, z, ry = 0, s = 1) {
  obj.scale.setScalar(s);
  obj.rotation.set(0, ry, 0);
  obj.position.set(0, 0, 0);
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const c = box.getCenter(new THREE.Vector3());
  obj.position.set(x - c.x, y - box.min.y, z - c.z);
  scene.add(obj);
  obj.updateMatrixWorld(true);
  return obj;
}

export async function buildKitchen(scene, room) {
  const names = ['dining_table', 'dining_chair_02', 'tea_set_01', 'vintage_electric_kettle', 'croissant', 'carved_wooden_plate',
    'wooden_bowl_01', 'food_apple_01', 'lemon', 'bananas', 'food_pears_asian_01', 'street_rat', 'mousetrap', 'wall_clock',
    'potted_plant_02', 'potted_plant_04', 'painted_wooden_cabinet', 'electric_stove', 'caged_hanging_light', 'wine_bottles_01',
    'jug_01', 'book_encyclopedia_set_01', 'round_spectacles', 'wooden_cutting_board', 'yellow_onion', 'wicker_basket_01',
    'painted_wooden_shelves', 'wooden_stool_01', 'hanging_picture_frame_01', 'calathea_orbifolia_01', 'vintage_oil_lamp',
    'pot_enamel_01', 'wooden_spoon', 'food_lime_01'];
  const G = {};
  await Promise.all(names.map(async (n) => { G[n] = (await loadModel(n)).scene; }));

  const E = {}; // objetos con mente
  const solids = []; // superficies que soportan cosas / colisionan
  const { x0, x1, z0, z1 } = ROOM;

  // --- mesa y sillas
  const table = put(scene, prepare(G.dining_table.clone(true)), -0.05, 0, -0.28, 0);
  E.table = table; solids.push(table);
  const top = surfaceAt([table], 0.2, -0.2);
  const chairSpots = [[-0.55, 0.62, Math.PI + 0.04], [1.05, 0.88, Math.PI - 0.55], [-0.35, -1.2, 0.1], [0.62, -1.22, -0.05]];
  E.chairs = chairSpots.map(([x, z, r]) => { const c = put(scene, prepare(G.dining_chair_02.clone(true)), x, 0, z, r); solids.push(c); return c; });

  // --- juego de té
  const ts = G.tea_set_01;
  const saucer = put(scene, prepare(pickNode(ts, 'tea_set_01_saucer_circular_03')), 0.34, top, 0.02);
  const saucerTop = surfaceAt([saucer], 0.34, 0.02, top + 0.2);
  E.cup = put(scene, prepare(pickNode(ts, 'tea_set_01_cup_small_01')), 0.34, saucerTop, 0.02, -0.6);
  E.saucer = saucer;
  const saucer2 = put(scene, prepare(pickNode(ts, 'tea_set_01_saucer_circular_04')), -0.62, top, -0.02);
  E.cup2 = put(scene, prepare(pickNode(ts, 'tea_set_01_cup_small_02')), -0.62, surfaceAt([saucer2], -0.62, -0.02, top + 0.2), -0.02, 2.2);
  E.teapot = put(scene, prepare(pickNode(ts, 'tea_set_01_teapot_01')), -0.12, top, -0.52, 0.5);
  const potBox = new THREE.Box3().setFromObject(E.teapot);
  const lid = put(scene, prepare(pickNode(ts, 'tea_set_01_teapot_01_lid')), 0, 0, 0, 0.5);
  lid.removeFromParent(); E.teapot.attach(lid);
  lid.position.copy(E.teapot.worldToLocal(new THREE.Vector3((potBox.min.x + potBox.max.x) / 2, potBox.max.y - 0.012, (potBox.min.z + potBox.max.z) / 2)));
  E.sugar = put(scene, prepare(pickNode(ts, 'tea_set_01_sugar_cup_01')), 0.12, top, -0.5);
  const sBox = new THREE.Box3().setFromObject(E.sugar);
  const slid = prepare(pickNode(ts, 'tea_set_01_sugar_cup_01_lid'));
  put(scene, slid, (sBox.min.x + sBox.max.x) / 2, sBox.max.y - 0.006, (sBox.min.z + sBox.max.z) / 2);

  // --- desayuno
  E.plate = put(scene, prepare(G.carved_wooden_plate.clone(true)), -0.08, top, 0.06);
  E.croissant = put(scene, prepare(G.croissant.clone(true)), -0.08, top + 0.012, 0.06, 0.7);
  E.bowl = put(scene, prepare(G.wooden_bowl_01.clone(true)), -0.62, top, -0.55);
  const bowlIn = top + 0.02;
  E.apple = put(scene, prepare(G.food_apple_01.clone(true)), -0.66, bowlIn, -0.57, 0.3);
  E.pear = put(scene, prepare(pickNode(G.food_pears_asian_01, 'food_pears_asian_01_a')), -0.56, bowlIn + 0.006, -0.5, 1.2);
  E.lime = put(scene, prepare(G.food_lime_01.clone(true)), -0.58, bowlIn + 0.01, -0.64, 0);
  E.spectacles = put(scene, prepare(G.round_spectacles.clone(true)), 0.66, top, 0.1, -0.35);

  // --- aparador (pared derecha)
  const cab = put(scene, prepare(G.painted_wooden_cabinet.clone(true)), x1 - 0.31, 0, 0.3, -Math.PI / 2);
  E.cabinet = cab; solids.push(cab);
  const cabTop = surfaceAt([cab], x1 - 0.3, 0.3);
  E.kettle = put(scene, prepare(G.vintage_electric_kettle.clone(true)), x1 - 0.33, cabTop, 0.48, -Math.PI / 2 - 0.5);
  E.board = put(scene, prepare(G.wooden_cutting_board.clone(true)), x1 - 0.3, cabTop, -0.02, Math.PI / 2 + 0.08);
  const boardTop = surfaceAt([E.board], x1 - 0.3, -0.02, cabTop + 0.2);
  E.lemon = put(scene, prepare(G.lemon.clone(true)), x1 - 0.32, boardTop, 0.06, 0.4);
  E.spoon = put(scene, prepare(G.wooden_spoon.clone(true)), x1 - 0.24, boardTop, -0.1, 1.3);
  const wb = G.wine_bottles_01;
  E.bottle = put(scene, prepare(pickNode(wb, 'wine_bottles_01_alsace')), x1 - 0.12, cabTop, 0.82);
  E.bottle2 = put(scene, prepare(pickNode(wb, 'wine_bottles_01_bordeaux')), x1 - 0.13, cabTop, 0.71);

  // --- cocina eléctrica
  const stove = put(scene, prepare(G.electric_stove.clone(true)), x1 - 0.33, 0, -0.78, -Math.PI / 2);
  E.stove = stove; solids.push(stove);
  E.pot = put(scene, prepare(G.pot_enamel_01.clone(true)), x1 - 0.36, surfaceAt([stove], x1 - 0.36, -0.86), -0.86, 0.4);

  // --- estantería
  const shelves = put(scene, prepare(G.painted_wooden_shelves.clone(true)), x1 - 0.19, 0, 1.65, -Math.PI / 2);
  E.shelves = shelves; solids.push(shelves);
  const shelfTop = surfaceAt([shelves], x1 - 0.19, 1.65);
  E.oillamp = put(scene, prepare(G.vintage_oil_lamp.clone(true)), x1 - 0.2, shelfTop, 1.7);
  const midShelf = surfaceAt([shelves], x1 - 0.19, 1.65, 0.85);
  const books = new THREE.Group();
  for (let i = 1; i <= 9; i++) books.add(pickNode(G.book_encyclopedia_set_01, `book_encyclopedia_set_01_book${String(i).padStart(2, '0')}`).translateX(i * 0.03));
  E.books = put(scene, prepare(books), x1 - 0.2, midShelf, 1.65, Math.PI / 2);
  const lowShelf = surfaceAt([shelves], x1 - 0.19, 1.65, 0.4);
  E.jug = put(scene, prepare(G.jug_01.clone(true)), x1 - 0.2, lowShelf, 1.62, -1.2);

  // --- suelo, pared, alféizar
  E.basket = put(scene, prepare(G.wicker_basket_01.clone(true)), 1.92, 0, 1.78, 0.4);
  E.onion = put(scene, prepare(G.yellow_onion.clone(true)), 1.88, 0.03, 1.76, 0.2);
  put(scene, prepare(G.yellow_onion.clone(true)), 1.98, 0.03, 1.82, 2.1);
  E.bananas = put(scene, prepare(pickNode(G.bananas, 'bananas_bunch')), -0.32, top, -0.12, 2.4);
  E.stool = put(scene, prepare(G.wooden_stool_01.clone(true)), 1.82, 0, -1.45, 0.5); solids.push(E.stool);
  E.trap = put(scene, prepare(G.mousetrap.clone(true)), 1.55, 0, 1.05, 0.9, 1.6);
  E.bigplant = put(scene, prepare(G.potted_plant_02.clone(true)), 2.2, 0, -1.78, 0.3, 1.15); solids.push(E.bigplant);
  const sillY = WINDOW.y0 + 0.0;
  E.plant = put(scene, prepare(pickNode(G.calathea_orbifolia_01, 'calathea_orbifolia_01_b')), -0.22, sillY, z0 + 0.09, 0.2, 0.9);
  E.cactus = put(scene, prepare(G.potted_plant_04.clone(true)), 0.88, sillY, z0 + 0.08, 0.6);
  const clock = prepare(G.wall_clock.clone(true));
  clock.rotation.y = Math.PI / 2; clock.position.set(x0 + 0.002, 2.02, -0.55);
  scene.add(clock); E.clock = clock;
  const frame = prepare(G.hanging_picture_frame_01.clone(true));
  frame.position.set(-1.55, 1.62, z0 + 0.004); scene.add(frame);
  frame.traverse((o) => { if (o.isMesh) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach((m) => { if (/glass/.test(m.name)) { m.transmission = 0; m.transparent = true; m.opacity = 0.12; m.depthWrite = false; } }); } }); E.frame = frame;

  // --- lámpara colgante
  const lamp = prepare(G.caged_hanging_light.clone(true), { cast: false });
  lamp.position.set(-0.05, ROOM.h, -0.28);
  scene.add(lamp); E.lamp = lamp;
  lamp.updateMatrixWorld(true);
  const lb = new THREE.Box3().setFromObject(lamp);
  const bulbPos = new THREE.Vector3(-0.05, lb.min.y + 0.16, -0.28);

  [table, cab, stove, shelves].forEach((o) => o.traverse((m) => { if (m.isMesh) room.colliders.push(m); }));
  return { E, solids, top, cabTop, bulbPos, models: G };
}
