/**
 * Minds — Main Entry Point
 *
 * Game flow:
 *   1. Title overlay → click to enter
 *   2. Constellation scene — choose your seed (first act of consciousness)
 *   3. Transition → World scene initialized from seed
 *
 * The seed biases what you see, feel, and can practice.
 * Every playthrough starts differently because YOU start differently.
 */

import * as THREE from 'three';
import { GameLoop } from './core';
import { ConstellationScene } from './scenes/ConstellationScene';
import { WorldScene } from './scenes/WorldScene';
import { SeedConfig } from './systems/SeedSystem';

// ─── State Machine ───────────────────────────────────────────────────────────

type GamePhase = 'title' | 'constellation' | 'transition' | 'world';

let phase: GamePhase = 'title';
let constellationScene: ConstellationScene | null = null;
let worldScene: WorldScene | null = null;

// Transition fade
let transitionAlpha = 0; // 0 = transparent, 1 = full black
let transitionTarget = 0;
const fadeOverlay = document.getElementById('fade-overlay')!;

// ─── Renderer (shared across scenes) ─────────────────────────────────────────

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.8;
document.getElementById('app')!.appendChild(renderer.domElement);

// ─── DOM Elements ────────────────────────────────────────────────────────────

const startOverlay = document.getElementById('start-overlay')!;
const hud = document.getElementById('hud')!;
const crosshair = document.getElementById('crosshair')!;
const seedHint = document.getElementById('seed-hint')!;

// ─── Phase: Title → Constellation ────────────────────────────────────────────

function enterConstellation(): void {
  phase = 'constellation';
  startOverlay.style.display = 'none';
  seedHint.style.display = 'block';
  // No crosshair during constellation — use the regular cursor
  crosshair.style.display = 'none';
  document.body.style.cursor = 'default';

  constellationScene = new ConstellationScene();

  constellationScene.onSeedSelected = (seed: SeedConfig) => {
    console.log(`🌟 Transitioning to world with seed: ${seed.id}`);
    seedHint.style.display = 'none';
    enterTransitionToWorld(seed);
  };

  gameLoop.start();
}

// ─── Phase: Constellation → World (via fade) ─────────────────────────────────

let pendingSeed: SeedConfig | null = null;
let transitionTimer = 0;

function enterTransitionToWorld(seed: SeedConfig): void {
  phase = 'transition';
  pendingSeed = seed;
  transitionTimer = 0;
  // The constellation scene handles its own fade-out animation.
  // We wait for it to complete, then show black, then fade into world.
}

function enterWorld(seed: SeedConfig): void {
  phase = 'world';

  // Clean up constellation
  constellationScene?.dispose();
  constellationScene = null;

  // Build world from seed
  worldScene = new WorldScene(seed);

  // Show crosshair and lock pointer for FPS controls
  crosshair.style.display = 'block';
  document.body.style.cursor = 'none';
  renderer.domElement.requestPointerLock();

  // Show HUD
  hud.style.display = 'block';

  // Fade in from black
  transitionAlpha = 1;
  transitionTarget = 0;
}

// ─── Game Loop ───────────────────────────────────────────────────────────────

const gameLoop = new GameLoop({
  update(dt: number) {
    switch (phase) {
      case 'constellation':
        constellationScene?.update(dt);
        break;

      case 'transition':
        // Keep updating constellation (it's animating its fade-out)
        constellationScene?.update(dt);
        transitionTimer += dt;

        // After constellation's own animation completes (~1.8s), hold black briefly then enter world
        if (transitionTimer > 2.2 && pendingSeed) {
          enterWorld(pendingSeed);
          pendingSeed = null;
        }
        break;

      case 'world':
        worldScene?.update(dt);
        break;
    }

    // Animate fade overlay
    if (Math.abs(transitionAlpha - transitionTarget) > 0.001) {
      transitionAlpha += (transitionTarget - transitionAlpha) * Math.min(1, 3 * dt);
      fadeOverlay.style.opacity = transitionAlpha.toString();
      fadeOverlay.style.pointerEvents = transitionAlpha > 0.01 ? 'all' : 'none';
    }
  },

  render(_alpha: number) {
    switch (phase) {
      case 'constellation':
      case 'transition':
        constellationScene?.render(renderer);
        break;

      case 'world':
        worldScene?.render(renderer);
        hud.textContent = `FPS: ${gameLoop.fps} | Entities: ${worldScene?.entityCount ?? 0}`;
        break;
    }
  },
});

// ─── Click to Start ──────────────────────────────────────────────────────────

startOverlay.addEventListener('click', () => {
  enterConstellation();
});

// ─── Resize Handling ─────────────────────────────────────────────────────────

window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  constellationScene?.resize(w, h);
  worldScene?.resize(w, h);
});

// ─── Pointer lock re-request on click in world phase ─────────────────────────

renderer.domElement.addEventListener('click', () => {
  if (phase === 'world' && document.pointerLockElement !== renderer.domElement) {
    renderer.domElement.requestPointerLock();
  }
});
