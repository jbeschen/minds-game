/**
 * WorldScene — The main game world, initialized from a seed.
 *
 * World layout:
 *   - Near ring (3-5m): Starter entities, easy discovery, teaches the gaze mechanic
 *   - Mid ring (6-10m): Deliberate observation needed, varied categories
 *   - Far ring (11-18m): Challenging, requires sustained focus and momentum
 *   - Hidden: Chained discovery — only appear after observing prerequisites
 *
 * Entity categories:
 *   - Organic: Soft, rounded forms (spheres, torus). Breathe and flow.
 *   - Crystalline: Sharp, geometric (octahedron, tetrahedron). Refract and fracture.
 *   - Ethereal: Barely there (small spheres, icosahedrons). Shimmer and flutter.
 *   - Structural: Grounded, solid (cubes, cylinders, cones). Anchor reality.
 *   - Hidden: Only visible after chain discovery. Reward deep observation.
 *
 * Seeds bias which entities are near-coherence vs deeply-hidden via tag matching.
 *
 * Environmental progression:
 *   - Fog recedes as discoveries accumulate
 *   - Ambient light brightens with discovery milestones
 *   - Scene background shifts from void-black toward seed-tinted color
 */

import * as THREE from 'three';
import { EventBus, World, FirstPersonCamera } from '../core';
import { RenderSystem } from '../systems/RenderSystem';
import { PerceptionSystem } from '../systems/PerceptionSystem';
import { AudioSystem } from '../systems/AudioSystem';
import { SeedConfig } from '../systems/SeedSystem';
import {
  MeshType,
  createTransform,
  createObservable,
  createRenderable,
} from '../components';
import { updateSeedProgress, getSeedProgress } from '../systems/SeedProgress';

// ─── Entity Definition Format ────────────────────────────────────────────────

interface EntityDef {
  name: string;               // For debugging and chained discovery
  x: number; y: number; z: number;
  color: number;
  meshType: MeshType;
  geometryScale?: number;     // Default 1
  decayRate: number;
  gainRate: number;
  revealThreshold: number;
  tags: string[];
  /** If set, this entity only spawns after ALL named entities are discovered */
  requiresDiscovery?: string[];
}

// ─── Awakening World Entities ────────────────────────────────────────────────

const AWAKENING_ENTITIES: EntityDef[] = [

  // ═══════════════════════════════════════════════════════════════════════════
  // NEAR RING (3-5m) — Starter entities, low thresholds, fast gain
  // The player's first discoveries. Teaches the "look at things" mechanic.
  // ═══════════════════════════════════════════════════════════════════════════

  // Welcoming sphere — the first thing most players will discover
  { name: 'welcome-light', x: 0.5, y: 0.8, z: -3, color: 0xecf0f1,
    meshType: 'sphere', decayRate: 0.06, gainRate: 0.3, revealThreshold: 0.25,
    tags: ['surface', 'light'] },

  // Grounding cube — solid, structural, close
  { name: 'ground-block', x: -1.2, y: 0.5, z: -3.5, color: 0xbdc3c7,
    meshType: 'cube', decayRate: 0.06, gainRate: 0.25, revealThreshold: 0.3,
    tags: ['surface', 'structure', 'sound'] },

  // Small curious orb — off to the side, rewards peripheral vision
  { name: 'curious-mote', x: 2.5, y: 0.4, z: -2.5, color: 0xe8d5b7,
    meshType: 'icosahedron', geometryScale: 0.6, decayRate: 0.08, gainRate: 0.35, revealThreshold: 0.2,
    tags: ['surface', 'warm', 'light'] },

  // ═══════════════════════════════════════════════════════════════════════════
  // MID RING — ORGANIC cluster (5-9m, left side)
  // Soft, flowing, warm. Spheres and tori.
  // ═══════════════════════════════════════════════════════════════════════════

  { name: 'ember-heart', x: 3, y: 1.0, z: -6, color: 0xff6b35,
    meshType: 'sphere', geometryScale: 1.2, decayRate: 0.05, gainRate: 0.15, revealThreshold: 0.45,
    tags: ['warm', 'energy', 'light'] },

  { name: 'flame-ring', x: 4.5, y: 0.7, z: -7, color: 0xff8c42,
    meshType: 'torus', decayRate: 0.05, gainRate: 0.14, revealThreshold: 0.5,
    tags: ['warm', 'flow', 'energy'] },

  { name: 'warmth-bloom', x: 2, y: 1.8, z: -7.5, color: 0xffad69,
    meshType: 'sphere', geometryScale: 0.8, decayRate: 0.04, gainRate: 0.18, revealThreshold: 0.4,
    tags: ['warm', 'light', 'energy'] },

  { name: 'kindling-knot', x: 3.5, y: 0.4, z: -5, color: 0xe67e22,
    meshType: 'torusknot', geometryScale: 0.7, decayRate: 0.05, gainRate: 0.13, revealThreshold: 0.5,
    tags: ['warm', 'chaos', 'instinct'] },

  // ═══════════════════════════════════════════════════════════════════════════
  // MID RING — CRYSTALLINE cluster (5-9m, right side)
  // Sharp, precise, structured. Octahedrons and tetrahedrons.
  // ═══════════════════════════════════════════════════════════════════════════

  { name: 'lattice-shard', x: -4, y: 1.2, z: -6, color: 0xf1c40f,
    meshType: 'octahedron', decayRate: 0.04, gainRate: 0.14, revealThreshold: 0.5,
    tags: ['pattern', 'structure', 'light'] },

  { name: 'order-spike', x: -3, y: 2.0, z: -7.5, color: 0xdaa520,
    meshType: 'tetrahedron', geometryScale: 1.3, decayRate: 0.04, gainRate: 0.12, revealThreshold: 0.55,
    tags: ['pattern', 'structure', 'connection'] },

  { name: 'facet-gem', x: -5, y: 0.6, z: -5.5, color: 0xe5c07b,
    meshType: 'dodecahedron', geometryScale: 0.8, decayRate: 0.05, gainRate: 0.16, revealThreshold: 0.45,
    tags: ['pattern', 'light', 'reflection'] },

  { name: 'crystal-pillar', x: -3.5, y: 1.0, z: -8.5, color: 0xc9b458,
    meshType: 'cylinder', geometryScale: 0.9, decayRate: 0.04, gainRate: 0.11, revealThreshold: 0.55,
    tags: ['structure', 'rigidity', 'pattern'] },

  // ═══════════════════════════════════════════════════════════════════════════
  // MID RING — FLOW / DEPTH cluster (6-9m, rear-center)
  // Cool, calm, reflective. The water/depth entities.
  // ═══════════════════════════════════════════════════════════════════════════

  { name: 'tide-sphere', x: -1, y: 1.0, z: -8, color: 0x4ecdc4,
    meshType: 'sphere', geometryScale: 1.1, decayRate: 0.05, gainRate: 0.13, revealThreshold: 0.5,
    tags: ['flow', 'depth', 'reflection'] },

  { name: 'depth-ring', x: 0.5, y: 0.5, z: -9, color: 0x45b7aa,
    meshType: 'torus', geometryScale: 1.2, decayRate: 0.04, gainRate: 0.11, revealThreshold: 0.55,
    tags: ['flow', 'depth', 'stillness'] },

  { name: 'still-drop', x: -2, y: 0.3, z: -7, color: 0x2ecc71,
    meshType: 'sphere', geometryScale: 0.6, decayRate: 0.04, gainRate: 0.15, revealThreshold: 0.5,
    tags: ['depth', 'stillness', 'reflection'] },

  // ═══════════════════════════════════════════════════════════════════════════
  // FAR RING (11-18m) — Challenging, requires sustained focus
  // These are the mystery objects. Slow gain, high thresholds.
  // ═══════════════════════════════════════════════════════════════════════════

  { name: 'void-sentinel', x: 0, y: 3.5, z: -16, color: 0x9b59b6,
    meshType: 'octahedron', geometryScale: 1.5, decayRate: 0.02, gainRate: 0.07, revealThreshold: 0.7,
    tags: ['shadow', 'hidden', 'silence'] },

  { name: 'chaos-ember', x: 9, y: 1.2, z: -13, color: 0xe74c3c,
    meshType: 'torusknot', geometryScale: 0.9, decayRate: 0.05, gainRate: 0.09, revealThreshold: 0.6,
    tags: ['energy', 'chaos', 'instinct', 'heat'] },

  { name: 'distant-beacon', x: -8, y: 2.5, z: -15, color: 0xf39c12,
    meshType: 'dodecahedron', geometryScale: 1.2, decayRate: 0.03, gainRate: 0.08, revealThreshold: 0.65,
    tags: ['pattern', 'light', 'connection'] },

  { name: 'shadow-monolith', x: 6, y: 2.0, z: -14, color: 0x5b2c6f,
    meshType: 'cylinder', geometryScale: 1.8, decayRate: 0.02, gainRate: 0.06, revealThreshold: 0.75,
    tags: ['shadow', 'structure', 'silence'] },

  { name: 'deep-resonance', x: -5, y: 1.0, z: -17, color: 0x1abc9c,
    meshType: 'sphere', geometryScale: 1.4, decayRate: 0.02, gainRate: 0.07, revealThreshold: 0.7,
    tags: ['depth', 'flow', 'emotion'] },

  { name: 'far-whisper', x: 3, y: 0.8, z: -18, color: 0x8e44ad,
    meshType: 'icosahedron', geometryScale: 0.9, decayRate: 0.03, gainRate: 0.06, revealThreshold: 0.7,
    tags: ['shadow', 'emotion', 'hidden'] },

  // ═══════════════════════════════════════════════════════════════════════════
  // ETHEREAL — scattered throughout, barely-there, small, reward sharp eyes
  // ═══════════════════════════════════════════════════════════════════════════

  { name: 'mote-alpha', x: 1.5, y: 2.5, z: -5.5, color: 0xd5dbdb,
    meshType: 'icosahedron', geometryScale: 0.35, decayRate: 0.1, gainRate: 0.2, revealThreshold: 0.35,
    tags: ['light', 'surface'] },

  { name: 'mote-beta', x: -2.5, y: 3.0, z: -10, color: 0xaeb6bf,
    meshType: 'icosahedron', geometryScale: 0.3, decayRate: 0.08, gainRate: 0.15, revealThreshold: 0.45,
    tags: ['silence', 'shadow'] },

  { name: 'mote-gamma', x: 5, y: 2.0, z: -8, color: 0xfad7a0,
    meshType: 'icosahedron', geometryScale: 0.4, decayRate: 0.09, gainRate: 0.18, revealThreshold: 0.4,
    tags: ['warm', 'light'] },

  // ═══════════════════════════════════════════════════════════════════════════
  // HIDDEN — Chained discovery. Only spawn after prerequisites are found.
  // These are the "reward" entities. Finding them feels like unlocking a secret.
  // ═══════════════════════════════════════════════════════════════════════════

  // Appears between the organic and crystalline clusters after you discover one from each
  { name: 'synthesis-arch', x: 0, y: 1.5, z: -6.5, color: 0xf0e68c,
    meshType: 'torusknot', geometryScale: 1.0, decayRate: 0.03, gainRate: 0.12, revealThreshold: 0.5,
    tags: ['pattern', 'connection', 'warm'],
    requiresDiscovery: ['ember-heart', 'lattice-shard'] },

  // Appears near the void sentinel once you've found the shadow monolith
  { name: 'void-mirror', x: 1, y: 3.0, z: -15, color: 0xbb8fce,
    meshType: 'dodecahedron', geometryScale: 1.1, decayRate: 0.02, gainRate: 0.1, revealThreshold: 0.6,
    tags: ['shadow', 'reflection', 'hidden'],
    requiresDiscovery: ['shadow-monolith', 'void-sentinel'] },

  // The "heart" of the world — appears only after discovering entities from 3+ categories
  { name: 'world-heart', x: 0, y: 1.2, z: -10, color: 0xffffff,
    meshType: 'icosahedron', geometryScale: 1.5, decayRate: 0.01, gainRate: 0.1, revealThreshold: 0.4,
    tags: ['connection', 'light', 'depth', 'pattern'],
    requiresDiscovery: ['ember-heart', 'lattice-shard', 'tide-sphere'] },
];

// ─── WorldScene ──────────────────────────────────────────────────────────────

export class WorldScene {
  readonly scene: THREE.Scene;
  readonly events: EventBus;
  readonly world: World;
  readonly playerCamera: FirstPersonCamera;

  private seed: SeedConfig;

  /** Map entity name → ECS entity ID (for chained discovery) */
  private entityNameMap: Map<string, number> = new Map();
  /** Set of discovered entity names */
  private discoveredNames: Set<string> = new Set();
  /** Pending chained entities waiting to be spawned */
  private pendingChained: EntityDef[] = [];
  /** Reverse map: entity ID → name */
  private entityIdToName: Map<number, string> = new Map();

  /** Discovery count for environmental progression */
  private discoveredCount = 0;
  private totalSpawnable = 0;

  /** Environmental references for progressive reveal */
  private ambientLight: THREE.AmbientLight;
  private dirLight: THREE.DirectionalLight;
  private fillLight: THREE.DirectionalLight;
  private fog: THREE.FogExp2;
  private seedEmotionColor: THREE.Color;

  /** Initial environment values (to interpolate from) */
  private readonly initialFogDensity = 0.025;
  private readonly minFogDensity = 0.008;
  private readonly initialAmbientIntensity = 0.4;
  private readonly maxAmbientIntensity = 1.0;
  private readonly initialDirIntensity = 0.6;
  private readonly maxDirIntensity = 1.2;

  /** Playtime tracking */
  private playtime = 0;

  /** Save/load notification element */
  private notificationEl: HTMLDivElement | null = null;
  private notificationTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(seed: SeedConfig) {
    this.seed = seed;
    this.totalSpawnable = AWAKENING_ENTITIES.length;

    // ─── Core
    this.events = new EventBus();
    this.world = new World(this.events);

    // ─── Three.js scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0a0f);
    this.fog = new THREE.FogExp2(0x0a0a0f, this.initialFogDensity);
    this.scene.fog = this.fog;

    // Lighting — tinted by seed emotion
    this.seedEmotionColor = new THREE.Color(this.emotionToAmbientColor(seed.emotion.worldVector));

    this.ambientLight = new THREE.AmbientLight(this.seedEmotionColor, this.initialAmbientIntensity);
    this.scene.add(this.ambientLight);

    this.dirLight = new THREE.DirectionalLight(0xffffff, this.initialDirIntensity);
    this.dirLight.position.set(5, 10, 5);
    this.scene.add(this.dirLight);

    // Subtle secondary fill light (opposite side, tinted)
    this.fillLight = new THREE.DirectionalLight(this.seedEmotionColor, 0.2);
    this.fillLight.position.set(-5, 3, -5);
    this.scene.add(this.fillLight);

    // ─── Camera
    this.playerCamera = new FirstPersonCamera();
    this.scene.add(this.playerCamera.body);

    // ─── Systems (order matters: perception → audio → render)
    this.world.registerSystem(new PerceptionSystem(this.playerCamera, this.scene));
    this.world.registerSystem(new AudioSystem(this.playerCamera));
    this.world.registerSystem(new RenderSystem(this.scene));

    // ─── Ground
    this.buildTerrain();

    // ─── Spawn entities biased by seed
    this.spawnEntities();

    // ─── Listen for discovery events (for chained spawning + environment)
    this.events.on('perception:entity_discovered', (e) => {
      const name = this.entityIdToName.get(e.entityId);
      if (name) {
        this.discoveredNames.add(name);
        this.discoveredCount++;
        this.updateEnvironment();
        this.checkChainedSpawns();
      }
    });

    // ─── Emit seed_selected so any system can read it
    this.events.emit('seed_selected', { seedId: seed.id, seed });

    // ─── Debug logging
    this.events.on('perception:entity_discovered', (e) => {
      const name = this.entityIdToName.get(e.entityId) ?? '?';
      console.log(`✦ Discovered "${name}" (observation: ${e.observationLevel.toFixed(2)}) [${this.discoveredCount}/${this.totalSpawnable}]`);
    });

    // ─── Save/Load
    document.addEventListener('keydown', this.handleSaveLoad);

    // ─── Create notification element
    this.createNotificationEl();

    // ─── Load previous progress for this seed
    const prev = getSeedProgress(seed.id);
    this.playtime = prev.playtime;
    updateSeedProgress(seed.id, {
      visits: prev.visits + 1,
      lastVisited: Date.now(),
      total: this.totalSpawnable,
    });
  }

  // ─── Terrain ───────────────────────────────────────────────────────────────

  private buildTerrain(): void {
    // Main ground plane
    const groundGeo = new THREE.PlaneGeometry(120, 120, 32, 32);

    // Subtle terrain undulation
    const positions = groundGeo.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      // Gentle rolling hills
      const height =
        Math.sin(x * 0.08) * Math.cos(y * 0.06) * 0.4 +
        Math.sin(x * 0.15 + 1.3) * Math.cos(y * 0.12 + 0.7) * 0.2;
      positions.setZ(i, height);
    }
    groundGeo.computeVertexNormals();

    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a2e,
      roughness: 0.95,
      metalness: 0.05,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    this.scene.add(ground);

    // Fog pillars — tall, faint silhouettes at the edges of the world
    // These are non-observable landmarks that give a sense of scale
    const pillarPositions = [
      [15, 0, -20], [-18, 0, -15], [20, 0, -8],
      [-12, 0, -25], [8, 0, -28], [-22, 0, -22],
    ];
    for (const [px, _py, pz] of pillarPositions) {
      const height = 4 + Math.random() * 6;
      const geo = new THREE.CylinderGeometry(0.3, 0.5, height, 6);
      const mat = new THREE.MeshStandardMaterial({
        color: 0x12122a,
        roughness: 1,
        transparent: true,
        opacity: 0.25,
      });
      const pillar = new THREE.Mesh(geo, mat);
      pillar.position.set(px, height / 2 - 0.5, pz);
      this.scene.add(pillar);
    }
  }

  // ─── Seed-biased entity spawning ───────────────────────────────────────────

  private spawnEntities(): void {
    const { nearCoherence, deeplyHidden, gainModifier } = this.seed.perception;

    for (const def of AWAKENING_ENTITIES) {
      // Chained entities are deferred
      if (def.requiresDiscovery && def.requiresDiscovery.length > 0) {
        this.pendingChained.push(def);
        continue;
      }

      this.spawnEntity(def, nearCoherence, deeplyHidden, gainModifier);
    }
  }

  private spawnEntity(
    def: EntityDef,
    nearCoherence: string[],
    deeplyHidden: string[],
    gainModifier: number
  ): void {
    const entity = this.world.createEntity();
    this.entityNameMap.set(def.name, entity);
    this.entityIdToName.set(entity, def.name);

    this.world.addComponent(entity, 'transform', createTransform(def.x, def.y, def.z));
    this.world.addComponent(entity, 'renderable',
      createRenderable(def.meshType, def.color, def.geometryScale ?? 1));

    // Bias observation based on seed tags
    let startingObservation = 0;
    let adjustedGain = def.gainRate * gainModifier;
    let adjustedDecay = def.decayRate;
    let adjustedThreshold = def.revealThreshold;

    const hasNearTag = def.tags.some((t) => nearCoherence.includes(t));
    const hasHiddenTag = def.tags.some((t) => deeplyHidden.includes(t));

    if (hasNearTag) {
      startingObservation = 0.12 + Math.random() * 0.15;
      adjustedGain *= 1.3;
      adjustedThreshold *= 0.85;
    }

    if (hasHiddenTag) {
      startingObservation = 0;
      adjustedDecay *= 1.4;
      adjustedThreshold = Math.min(0.9, adjustedThreshold * 1.2);
    }

    const observable = createObservable(adjustedDecay, adjustedGain, adjustedThreshold);
    observable.observationLevel = startingObservation;
    this.world.addComponent(entity, 'observable', observable);
  }

  // ─── Chained discovery ─────────────────────────────────────────────────────

  private checkChainedSpawns(): void {
    const { nearCoherence, deeplyHidden, gainModifier } = this.seed.perception;

    const toSpawn: EntityDef[] = [];
    const remaining: EntityDef[] = [];

    for (const def of this.pendingChained) {
      const allMet = def.requiresDiscovery!.every((name) => this.discoveredNames.has(name));
      if (allMet) {
        toSpawn.push(def);
      } else {
        remaining.push(def);
      }
    }

    this.pendingChained = remaining;

    for (const def of toSpawn) {
      console.log(`✧ Chain unlocked: "${def.name}" has materialized!`);
      this.spawnEntity(def, nearCoherence, deeplyHidden, gainModifier);
    }
  }

  // ─── Environmental progression ─────────────────────────────────────────────

  /**
   * As the player discovers more, the world itself responds:
   *   - Fog recedes (you can see farther)
   *   - Ambient light brightens (the void retreats)
   *   - Background color shifts toward the seed's emotional tint
   *
   * This makes discovery feel like it *matters* — you're not just finding objects,
   * you're literally bringing light to the world.
   */
  private updateEnvironment(): void {
    const ratio = this.discoveredCount / this.totalSpawnable;

    // Fog recedes: dense void → clearer air
    const fogDensity = this.initialFogDensity - (this.initialFogDensity - this.minFogDensity) * ratio;
    this.fog.density = fogDensity;

    // Ambient light strengthens
    const ambientIntensity = this.initialAmbientIntensity +
      (this.maxAmbientIntensity - this.initialAmbientIntensity) * ratio;
    this.ambientLight.intensity = ambientIntensity;

    // Directional light strengthens
    const dirIntensity = this.initialDirIntensity +
      (this.maxDirIntensity - this.initialDirIntensity) * ratio;
    this.dirLight.intensity = dirIntensity;

    // Fill light grows
    this.fillLight.intensity = 0.2 + ratio * 0.4;

    // Background color shifts from void-black toward a faint seed tint
    const bgColor = new THREE.Color(0x0a0a0f);
    const targetBg = this.seedEmotionColor.clone().multiplyScalar(0.15);
    bgColor.lerp(targetBg, ratio);
    (this.scene.background as THREE.Color).copy(bgColor);

    // Fog color also shifts slightly toward warmth
    this.fog.color.copy(bgColor);
  }

  // ─── Emotion → ambient color ───────────────────────────────────────────────

  private emotionToAmbientColor(vector: number[]): number {
    const r = Math.floor((0.25 + vector[0] * 0.15 + vector[5] * 0.05) * 255);
    const g = Math.floor((0.25 + vector[2] * 0.1 + vector[3] * 0.1) * 255);
    const b = Math.floor((0.35 + vector[4] * 0.1 + vector[3] * 0.1) * 255);
    return (Math.min(r, 255) << 16) | (Math.min(g, 255) << 8) | Math.min(b, 255);
  }

  // ─── Update / Render ───────────────────────────────────────────────────────

  update(dt: number): void {
    this.playerCamera.update(dt);
    this.world.update(dt);
    this.playtime += dt;
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
        discoveredNames: [...this.discoveredNames],
        camera: this.playerCamera.getState(),
      });
      localStorage.setItem('minds_save', save);
      console.log('💾 World saved');
      this.showNotification('World saved', '#4ecdc4');
    }
    if (e.code === 'F9') {
      e.preventDefault();
      const raw = localStorage.getItem('minds_save');
      if (raw) {
        const save = JSON.parse(raw);
        this.world.deserialize(save.world);

        // Restore discovered names
        if (save.discoveredNames) {
          this.discoveredNames.clear();
          this.discoveredCount = 0;
          for (const name of save.discoveredNames) {
            this.discoveredNames.add(name);
            this.discoveredCount++;
          }
          this.updateEnvironment();
          this.checkChainedSpawns();
        }

        // Restore camera position and orientation
        if (save.camera) {
          this.playerCamera.setState(save.camera);
        }

        console.log('📂 World loaded');
        this.showNotification('World loaded', '#f39c12');
      } else {
        this.showNotification('No save found', '#e74c3c');
      }
    }
  };

  // ─── Notification UI ───────────────────────────────────────────────────────

  private createNotificationEl(): void {
    this.notificationEl = document.createElement('div');
    Object.assign(this.notificationEl.style, {
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      padding: '12px 28px',
      fontFamily: 'Georgia, serif',
      fontSize: '1.1rem',
      letterSpacing: '0.1em',
      borderRadius: '4px',
      background: 'rgba(0, 0, 0, 0.7)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      zIndex: '200',
      pointerEvents: 'none',
      opacity: '0',
      transition: 'opacity 0.3s ease',
    });
    document.body.appendChild(this.notificationEl);
  }

  private showNotification(text: string, color: string): void {
    if (!this.notificationEl) return;
    if (this.notificationTimeout) clearTimeout(this.notificationTimeout);

    this.notificationEl.textContent = text;
    this.notificationEl.style.color = color;
    this.notificationEl.style.borderColor = color + '44';
    this.notificationEl.style.opacity = '1';

    this.notificationTimeout = setTimeout(() => {
      if (this.notificationEl) {
        this.notificationEl.style.opacity = '0';
      }
    }, 1200);
  }

  // ─── Cleanup ───────────────────────────────────────────────────────────────

  dispose(): void {
    document.removeEventListener('keydown', this.handleSaveLoad);
    if (this.notificationEl) {
      document.body.removeChild(this.notificationEl);
    }

    // Destroy all ECS systems (stops audio oscillators, cleans up meshes)
    this.world.removeSystem('audio');
    this.world.removeSystem('render');
    this.world.removeSystem('perception');

    // Persist seed progress for constellation display
    updateSeedProgress(this.seed.id, {
      discovered: this.discoveredCount,
      total: this.totalSpawnable,
      playtime: this.playtime,
    });
  }

  /** Getters for HUD */
  get entityCount(): number {
    return this.world.getAllEntities().length;
  }

  get discovered(): number {
    return this.discoveredCount;
  }

  get totalEntities(): number {
    return this.totalSpawnable;
  }
}
