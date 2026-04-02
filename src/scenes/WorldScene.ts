/**
 * WorldScene — The main game world, initialized from a seed.
 *
 * Extracts the world setup from main.ts into a reusable module.
 * The seed biases what entities spawn, their observation levels,
 * and the emotional tone of the starting environment.
 */

import * as THREE from 'three';
import { EventBus, World, FirstPersonCamera } from '../core';
import { RenderSystem } from '../systems/RenderSystem';
import { PerceptionSystem } from '../systems/PerceptionSystem';
import { SeedConfig } from '../systems/SeedSystem';
import {
  createTransform,
  createObservable,
  createRenderable,
} from '../components';

// ─── Entity tag definitions (used by seed perception biases) ─────────────────

interface EntityDef {
  x: number;
  y: number;
  z: number;
  color: number;
  meshType: 'sphere' | 'cube';
  decayRate: number;
  gainRate: number;
  revealThreshold: number;
  tags: string[];
}

/** The full set of entities for the Awakening story. Seeds bias which are visible. */
const AWAKENING_ENTITIES: EntityDef[] = [
  // ─── Warm / Fire / Energy cluster
  { x: 3, y: 1, z: -5, color: 0xff6b35, meshType: 'sphere', decayRate: 0.05, gainRate: 0.15, revealThreshold: 0.5, tags: ['warm', 'energy', 'light'] },
  { x: 4, y: 0.5, z: -6, color: 0xff8c42, meshType: 'cube', decayRate: 0.05, gainRate: 0.15, revealThreshold: 0.5, tags: ['warm', 'structure', 'heat'] },
  { x: 2.5, y: 1.5, z: -7, color: 0xffad69, meshType: 'sphere', decayRate: 0.03, gainRate: 0.2, revealThreshold: 0.4, tags: ['warm', 'light', 'energy'] },

  // ─── Cool / Flow / Depth cluster
  { x: -4, y: 1, z: -8, color: 0x4ecdc4, meshType: 'sphere', decayRate: 0.05, gainRate: 0.15, revealThreshold: 0.5, tags: ['flow', 'depth', 'reflection'] },
  { x: -3, y: 2, z: -7, color: 0x45b7aa, meshType: 'cube', decayRate: 0.05, gainRate: 0.15, revealThreshold: 0.5, tags: ['flow', 'structure'] },
  { x: -5, y: 0.8, z: -9, color: 0x2ecc71, meshType: 'sphere', decayRate: 0.04, gainRate: 0.12, revealThreshold: 0.6, tags: ['depth', 'stillness'] },

  // ─── Shadow / Void / Mystery cluster
  { x: 0, y: 3, z: -15, color: 0x9b59b6, meshType: 'sphere', decayRate: 0.02, gainRate: 0.08, revealThreshold: 0.7, tags: ['shadow', 'hidden', 'silence'] },
  { x: 8, y: 1, z: -12, color: 0xe74c3c, meshType: 'cube', decayRate: 0.06, gainRate: 0.1, revealThreshold: 0.5, tags: ['energy', 'chaos', 'instinct'] },
  { x: -7, y: 2, z: -14, color: 0xf1c40f, meshType: 'sphere', decayRate: 0.03, gainRate: 0.09, revealThreshold: 0.65, tags: ['pattern', 'light', 'connection'] },

  // ─── Pattern / Structure cluster
  { x: 5, y: 1.5, z: -10, color: 0xdaa520, meshType: 'cube', decayRate: 0.04, gainRate: 0.12, revealThreshold: 0.55, tags: ['pattern', 'structure', 'connection'] },
  { x: -6, y: 1, z: -11, color: 0x8e44ad, meshType: 'sphere', decayRate: 0.03, gainRate: 0.1, revealThreshold: 0.6, tags: ['shadow', 'emotion', 'depth'] },

  // ─── Near / Starter objects
  { x: 1, y: 0.5, z: -3, color: 0xecf0f1, meshType: 'sphere', decayRate: 0.08, gainRate: 0.3, revealThreshold: 0.3, tags: ['surface', 'light'] },
  { x: -1, y: 0.8, z: -4, color: 0xbdc3c7, meshType: 'cube', decayRate: 0.07, gainRate: 0.25, revealThreshold: 0.35, tags: ['surface', 'sound'] },
];

// ─── WorldScene ──────────────────────────────────────────────────────────────

export class WorldScene {
  readonly scene: THREE.Scene;
  readonly events: EventBus;
  readonly world: World;
  readonly playerCamera: FirstPersonCamera;

  private seed: SeedConfig;

  constructor(seed: SeedConfig) {
    this.seed = seed;

    // ─── Core
    this.events = new EventBus();
    this.world = new World(this.events);

    // ─── Three.js scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0a0f);
    this.scene.fog = new THREE.FogExp2(0x0a0a0f, 0.03);

    // Lighting — tinted by seed emotion
    const emotionColor = this.emotionToAmbientColor(seed.emotion.worldVector);
    const ambientLight = new THREE.AmbientLight(emotionColor, 0.4);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
    dirLight.position.set(5, 10, 5);
    this.scene.add(dirLight);

    // ─── Camera
    this.playerCamera = new FirstPersonCamera();
    this.scene.add(this.playerCamera.body);

    // ─── Systems
    this.world.registerSystem(new PerceptionSystem(this.playerCamera, this.scene));
    this.world.registerSystem(new RenderSystem(this.scene));

    // ─── Ground
    const groundGeo = new THREE.PlaneGeometry(100, 100);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a2e,
      roughness: 0.9,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.01;
    this.scene.add(ground);

    // ─── Spawn entities biased by seed
    this.spawnEntities();

    // ─── Emit seed_selected so any system can read it
    this.events.emit('seed_selected', {
      seedId: seed.id,
      seed,
    });

    // ─── Debug logging
    this.events.on('entity_discovered', (e) => {
      console.log(`✦ Entity ${e.entityId} discovered! (observation: ${e.observationLevel.toFixed(2)})`);
    });

    // ─── Save/Load
    document.addEventListener('keydown', this.handleSaveLoad);
  }

  // ─── Seed-biased entity spawning ───────────────────────────────────────────

  private spawnEntities(): void {
    const { nearCoherence, deeplyHidden, gainModifier } = this.seed.perception;

    for (const def of AWAKENING_ENTITIES) {
      const entity = this.world.createEntity();
      this.world.addComponent(entity, 'transform', createTransform(def.x, def.y, def.z));
      this.world.addComponent(entity, 'renderable', createRenderable(def.meshType, def.color));

      // Bias observation based on seed tags
      let startingObservation = 0;
      let adjustedGain = def.gainRate * gainModifier;
      let adjustedDecay = def.decayRate;
      let adjustedThreshold = def.revealThreshold;

      const hasNearTag = def.tags.some((t) => nearCoherence.includes(t));
      const hasHiddenTag = def.tags.some((t) => deeplyHidden.includes(t));

      if (hasNearTag) {
        // Near-coherence entities start partially visible and are easier to observe
        startingObservation = 0.15 + Math.random() * 0.15;
        adjustedGain *= 1.3;
        adjustedThreshold *= 0.85;
      }

      if (hasHiddenTag) {
        // Deeply hidden entities are harder to find
        startingObservation = 0;
        adjustedDecay *= 1.4;
        adjustedThreshold = Math.min(0.9, adjustedThreshold * 1.2);
      }

      const observable = createObservable(adjustedDecay, adjustedGain, adjustedThreshold);
      observable.observationLevel = startingObservation;
      this.world.addComponent(entity, 'observable', observable);
    }
  }

  // ─── Emotion → ambient color ───────────────────────────────────────────────

  private emotionToAmbientColor(vector: number[]): number {
    // [warmth, tension, curiosity, awe, melancholy, energy]
    const r = Math.floor((0.25 + vector[0] * 0.15 + vector[5] * 0.05) * 255);
    const g = Math.floor((0.25 + vector[2] * 0.1 + vector[3] * 0.1) * 255);
    const b = Math.floor((0.35 + vector[4] * 0.1 + vector[3] * 0.1) * 255);
    return (Math.min(r, 255) << 16) | (Math.min(g, 255) << 8) | Math.min(b, 255);
  }

  // ─── Update / Render ───────────────────────────────────────────────────────

  update(dt: number): void {
    this.playerCamera.update(dt);
    this.world.update(dt);
  }

  render(renderer: THREE.WebGLRenderer): void {
    renderer.render(this.scene, this.playerCamera.camera);
  }

  // ─── Resize ────────────────────────────────────────────────────────────────

  resize(width: number, height: number): void {
    this.playerCamera.resize(width, height);
  }

  // ─── Save / Load ───────────────────────────────────────────────────────────

  private handleSaveLoad = (e: KeyboardEvent): void => {
    if (e.code === 'F5') {
      e.preventDefault();
      const save = JSON.stringify({
        seedId: this.seed.id,
        world: this.world.serialize(),
      });
      localStorage.setItem('minds_save', save);
      console.log('💾 World saved');
    }
    if (e.code === 'F9') {
      e.preventDefault();
      const raw = localStorage.getItem('minds_save');
      if (raw) {
        const save = JSON.parse(raw);
        this.world.deserialize(save.world);
        console.log('📂 World loaded');
      }
    }
  };

  // ─── Cleanup ───────────────────────────────────────────────────────────────

  dispose(): void {
    document.removeEventListener('keydown', this.handleSaveLoad);
  }

  /** Getters for HUD */
  get entityCount(): number {
    return this.world.getAllEntities().length;
  }
}
