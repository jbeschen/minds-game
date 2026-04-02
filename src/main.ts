/**
 * Minds — Main Entry Point
 * 
 * Wires up the Mindcore engine: ECS, event bus, renderer, camera, systems.
 * Spawns a test world with observable entities to verify the core loop:
 *   look at things → they become real → look away → they fade
 */

import * as THREE from 'three';
import { EventBus, World, GameLoop, FirstPersonCamera } from './core';
import { RenderSystem } from './systems/RenderSystem';
import { PerceptionSystem } from './systems/PerceptionSystem';
import {
  createTransform,
  createObservable,
  createRenderable,
} from './components';

// ─── Bootstrap ────────────────────────────────────────────────────────────────

const events = new EventBus();
const world = new World(events);

// Three.js scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a0f); // Near-black void
scene.fog = new THREE.FogExp2(0x0a0a0f, 0.03);

// Lighting — dim ambient + soft directional (world starts subtle)
const ambientLight = new THREE.AmbientLight(0x404060, 0.4);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
dirLight.position.set(5, 10, 5);
scene.add(dirLight);

// Camera
const playerCamera = new FirstPersonCamera();
scene.add(playerCamera.body);

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.8;
document.getElementById('app')!.appendChild(renderer.domElement);

// ─── Register Systems ─────────────────────────────────────────────────────────

world.registerSystem(new PerceptionSystem(playerCamera, scene));
world.registerSystem(new RenderSystem(scene));

// ─── Ground Plane (always visible, no observation needed) ─────────────────────

const groundGeo = new THREE.PlaneGeometry(100, 100);
const groundMat = new THREE.MeshStandardMaterial({
  color: 0x1a1a2e,
  roughness: 0.9,
});
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.01;
scene.add(ground);

// ─── Spawn Test Entities ──────────────────────────────────────────────────────

function spawnObservable(
  x: number, y: number, z: number,
  color: number,
  meshType: 'sphere' | 'cube' = 'sphere',
  decayRate = 0.05,
  gainRate = 0.15,
  revealThreshold = 0.5
): void {
  const entity = world.createEntity();
  world.addComponent(entity, 'transform', createTransform(x, y, z));
  world.addComponent(entity, 'renderable', createRenderable(meshType, color));
  world.addComponent(entity, 'observable', createObservable(decayRate, gainRate, revealThreshold));
}

// Scatter entities in a loose arrangement — a nascent world emerging from void
// Warm cluster
spawnObservable(3, 1, -5, 0xff6b35, 'sphere');
spawnObservable(4, 0.5, -6, 0xff8c42, 'cube');
spawnObservable(2.5, 1.5, -7, 0xffad69, 'sphere', 0.03, 0.2, 0.4);

// Cool cluster
spawnObservable(-4, 1, -8, 0x4ecdc4, 'sphere');
spawnObservable(-3, 2, -7, 0x45b7aa, 'cube');
spawnObservable(-5, 0.8, -9, 0x2ecc71, 'sphere', 0.04, 0.12, 0.6);

// Mysterious distant objects (harder to observe)
spawnObservable(0, 3, -15, 0x9b59b6, 'sphere', 0.02, 0.08, 0.7);
spawnObservable(8, 1, -12, 0xe74c3c, 'cube', 0.06, 0.1, 0.5);
spawnObservable(-7, 2, -14, 0xf1c40f, 'sphere', 0.03, 0.09, 0.65);

// Near objects (easy to discover first)
spawnObservable(1, 0.5, -3, 0xecf0f1, 'sphere', 0.08, 0.3, 0.3);
spawnObservable(-1, 0.8, -4, 0xbdc3c7, 'cube', 0.07, 0.25, 0.35);

// ─── Event Logging (debug) ────────────────────────────────────────────────────

events.on('entity_discovered', (e) => {
  console.log(`✦ Entity ${e.entityId} discovered! (observation: ${e.observationLevel.toFixed(2)})`);
});

// ─── HUD ──────────────────────────────────────────────────────────────────────

const hud = document.getElementById('hud')!;
const crosshair = document.getElementById('crosshair')!;

// ─── Game Loop ────────────────────────────────────────────────────────────────

const gameLoop = new GameLoop({
  update(dt: number) {
    playerCamera.update(dt);
    world.update(dt);
  },
  render(_alpha: number) {
    renderer.render(scene, playerCamera.camera);
    hud.textContent = `FPS: ${gameLoop.fps} | Entities: ${world.getAllEntities().length}`;
  },
});

// ─── Click to Start ───────────────────────────────────────────────────────────

const startOverlay = document.getElementById('start-overlay')!;

startOverlay.addEventListener('click', () => {
  playerCamera.requestLock(renderer.domElement);
  startOverlay.style.display = 'none';
  gameLoop.start();
});

// ─── Resize Handling ──────────────────────────────────────────────────────────

window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  playerCamera.resize(w, h);
});

// ─── Save/Load (keyboard shortcuts) ──────────────────────────────────────────

document.addEventListener('keydown', (e) => {
  if (e.code === 'F5') {
    e.preventDefault();
    const save = world.serialize();
    localStorage.setItem('minds_save', save);
    console.log('💾 World saved');
  }
  if (e.code === 'F9') {
    e.preventDefault();
    const save = localStorage.getItem('minds_save');
    if (save) {
      world.deserialize(save);
      console.log('📂 World loaded');
    }
  }
});
