/**
 * EmotionSystem — The world as mirror.
 *
 * "The world responds to how you feel — and how you feel is shaped by
 *  what you pay attention to."
 *
 * This system maintains a hidden player emotion vector inferred from behavior:
 *   - Movement speed/stillness → energy, tension
 *   - Gaze duration on entity types → warmth, curiosity, awe, melancholy
 *   - Exploration breadth vs depth → curiosity vs focus
 *   - Revisitation patterns → attachment, melancholy
 *   - Discovery rate → awe, energy
 *
 * Entities with EmotionalField components create resonance or dissonance
 * with the player's state. Resonance amplifies observation; dissonance resists.
 *
 * The player NEVER sees emotion labels. They only experience effects:
 *   - Color temperature shifts
 *   - Fog density modulation
 *   - Entity glow warmth/coolness
 *   - Audio harmonic changes (handled by AudioSystem listening to events)
 *
 * Plugin guardrail: Reads observable/transform/emotionalField components,
 * emits events on the bus. No system imports.
 *
 * Emotion dimensions:
 *   [0] warmth     — connection, comfort, empathy
 *   [1] tension    — alertness, unease, anticipation
 *   [2] curiosity  — exploration drive, novelty-seeking
 *   [3] awe        — wonder, vastness, the sublime
 *   [4] melancholy — reflection, loss, bittersweet beauty
 *   [5] energy     — vitality, momentum, intensity
 */

import { System, World, EntityId } from '../core/ECS';
import { FirstPersonCamera } from '../core/FirstPersonCamera';

// ─── Constants ──────────────────────────────────────────────────────────────

/** Number of emotion dimensions */
const DIM = 6;

/** How quickly the player vector rises toward inferred state (per second) */
const INFERENCE_RATE_UP = 0.3;

/** How quickly the player vector falls — feelings linger (per second) */
const INFERENCE_RATE_DOWN = 0.08;

/** How quickly emotion decays toward neutral (per second) */
const DECAY_RATE = 0.02;

/** Neutral emotion vector — everything at low baseline */
const NEUTRAL = [0.2, 0.2, 0.2, 0.2, 0.2, 0.2];

// ─── Behavior Tracking ─────────────────────────────────────────────────────

interface BehaviorState {
  /** Smoothed movement speed (units/sec) */
  smoothSpeed: number;
  /** Time spent still (< 0.3 units/sec) in recent window */
  stillnessAccum: number;
  /** Number of distinct entities gazed at in last 30s */
  gazeVariety: Set<number>;
  /** Number of sustained gazes (> 2s) in last 30s */
  deepGazeCount: number;
  /** Seconds since last discovery */
  timeSinceDiscovery: number;
  /** Recent discovery rate (discoveries per minute, smoothed) */
  discoveryRate: number;
  /** Number of re-gazes (entities gazed at more than once) */
  revisitCount: number;
  /** Entities we've gazed at before (for revisit tracking) */
  previouslyGazed: Set<number>;
  /** Last gaze timestamp per entity (for revisit debounce) */
  lastGazeTimePerEntity: Map<number, number>;
  /** Position last frame */
  lastX: number;
  lastZ: number;
  /** Rolling window timer for resetting gaze variety */
  windowTimer: number;
}

// ─── EmotionSystem ──────────────────────────────────────────────────────────

export class EmotionSystem implements System {
  name = 'emotion';
  requiredComponents: string[] = []; // Processes all entities with emotionalField

  private camera: FirstPersonCamera;

  /** The player's current emotion vector — hidden, never displayed to player */
  private playerVector: number[] = [...NEUTRAL];

  /** Inferred target vector from behavior this frame */
  private inferredVector: number[] = [...NEUTRAL];

  /** Resonance values per entity (entityId → resonance -1..1) */
  private entityResonance: Map<number, number> = new Map();

  /** Strongest resonance this frame (for global effects) */
  private peakResonance = 0;

  /** Dominant emotion index (for shader color effects) */
  private dominantEmotion = 2; // curiosity by default

  /** Behavior tracking */
  private behavior: BehaviorState = {
    smoothSpeed: 0,
    stillnessAccum: 0,
    gazeVariety: new Set(),
    deepGazeCount: 0,
    timeSinceDiscovery: 10, // start as if it's been a while
    discoveryRate: 0,
    revisitCount: 0,
    previouslyGazed: new Set(),
    lastGazeTimePerEntity: new Map(),
    lastX: 0,
    lastZ: 0,
    windowTimer: 0,
  };

  /** Discovery completion tracking — tension shouldn't penalize an empty well */
  private totalDiscovered = 0;
  private totalObservable = 0;

  /** Currently gazed entity info (for debug overlay) */
  private gazedEntityId: number | null = null;
  private gazedEntityName: string = '';

  /** Seed starting vector (sets initial emotional tone) */
  private seedVector: number[] = [...NEUTRAL];

  constructor(camera: FirstPersonCamera) {
    this.camera = camera;
  }

  init(world: World): void {
    // Listen to seed selection for initial emotion bias
    world.events.on('seed_selected', (e) => {
      if (e.seed?.emotion?.worldVector) {
        this.seedVector = [...e.seed.emotion.worldVector];
        this.playerVector = [...e.seed.emotion.worldVector];
      }
    });

    // Track discoveries for awe/energy inference
    world.events.on('perception:entity_discovered', () => {
      this.behavior.timeSinceDiscovery = 0;
      this.totalDiscovered++;
      // Smooth discovery rate: exponential moving average
      this.behavior.discoveryRate = this.behavior.discoveryRate * 0.7 + 0.3 * 2.0; // bump
    });

    // Track gaze for curiosity/warmth inference
    world.events.on('perception:gaze_start', (e) => {
      this.behavior.gazeVariety.add(e.entityId);
      this.gazedEntityId = e.entityId;
      // Debounce revisits: re-gazing the same entity within 5s is flicker, not revisitation
      const lastGazeTime = this.behavior.lastGazeTimePerEntity.get(e.entityId) ?? -10;
      const now = performance.now() / 1000;
      if (this.behavior.previouslyGazed.has(e.entityId) && (now - lastGazeTime) > 5) {
        this.behavior.revisitCount++;
      }
      this.behavior.previouslyGazed.add(e.entityId);
      this.behavior.lastGazeTimePerEntity.set(e.entityId, now);
    });

    world.events.on('perception:gaze_end', () => {
      this.gazedEntityId = null;
      this.gazedEntityName = '';
    });

    // Initialize position tracking
    const pos = this.camera.getWorldPosition();
    this.behavior.lastX = pos.x;
    this.behavior.lastZ = pos.z;
  }

  update(world: World, dt: number, _entities: EntityId[]): void {
    // Count total observable (once)
    if (this.totalObservable === 0) {
      this.totalObservable = world.query('observable').length;
    }

    // ─── 1. Track player behavior ───────────────────────────────────
    this.trackBehavior(dt);

    // ─── 2. Infer emotion from behavior ─────────────────────────────
    this.inferEmotion(world, dt);

    // ─── 3. Blend player vector toward inferred ─────────────────────
    for (let i = 0; i < DIM; i++) {
      // Drift toward inferred state — asymmetric: fast to feel, slow to fade
      const rising = this.inferredVector[i] > this.playerVector[i];
      const rate = rising ? INFERENCE_RATE_UP : INFERENCE_RATE_DOWN;
      this.playerVector[i] += (this.inferredVector[i] - this.playerVector[i]) * rate * dt;
      // Gentle decay toward neutral
      this.playerVector[i] += (NEUTRAL[i] - this.playerVector[i]) * DECAY_RATE * dt;
      // Clamp
      this.playerVector[i] = Math.max(0, Math.min(1, this.playerVector[i]));
    }

    // ─── 4. Find dominant emotion ───────────────────────────────────
    let maxVal = 0;
    for (let i = 0; i < DIM; i++) {
      if (this.playerVector[i] > maxVal) {
        maxVal = this.playerVector[i];
        this.dominantEmotion = i;
      }
    }

    // ─── 5. Calculate resonance with emotional field entities ────────
    this.peakResonance = 0;
    const fieldEntities = world.query('emotionalField', 'transform');
    const playerPos = this.camera.getWorldPosition();

    for (const id of fieldEntities) {
      const field = world.getComponent(id, 'emotionalField')!;
      const transform = world.getComponent(id, 'transform')!;

      // Distance check
      const dx = playerPos.x - transform.x;
      const dy = playerPos.y - transform.y;
      const dz = playerPos.z - transform.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (dist > field.radius) {
        this.entityResonance.set(id, 0);
        continue;
      }

      // Resonance = dot product of normalized vectors, scaled by proximity and intensity
      const resonance = this.calculateResonance(this.playerVector, field.vector);
      const proximity = 1 - (dist / field.radius);
      const finalResonance = resonance * proximity * field.intensity;

      this.entityResonance.set(id, finalResonance);

      if (Math.abs(finalResonance) > Math.abs(this.peakResonance)) {
        this.peakResonance = finalResonance;
      }
    }

    // ─── 6. Emit state for other systems ────────────────────────────
    // Per-entity resonance map for the render system
    const resonanceMap: Record<number, number> = {};
    for (const [id, res] of this.entityResonance) {
      if (Math.abs(res) > 0.01) {
        resonanceMap[id] = res;
      }
    }

    world.events.emit('emotion:state_updated', {
      playerVector: [...this.playerVector],
      dominantEmotion: this.dominantEmotion,
      peakResonance: this.peakResonance,
      entityResonance: resonanceMap,
      gazedEntityId: this.gazedEntityId,
      allDiscovered: this.totalDiscovered >= this.totalObservable,
    });
  }

  // ─── Behavior Tracking ──────────────────────────────────────────────────

  private trackBehavior(dt: number): void {
    const b = this.behavior;
    const pos = this.camera.getWorldPosition();

    // Movement speed
    const dx = pos.x - b.lastX;
    const dz = pos.z - b.lastZ;
    const instantSpeed = Math.sqrt(dx * dx + dz * dz) / Math.max(dt, 0.001);
    b.smoothSpeed = b.smoothSpeed * 0.9 + instantSpeed * 0.1;
    b.lastX = pos.x;
    b.lastZ = pos.z;

    // Stillness accumulation — drains quickly when moving
    if (b.smoothSpeed < 0.3) {
      b.stillnessAccum += dt;
    } else {
      b.stillnessAccum = Math.max(0, b.stillnessAccum - dt * 2.0);
    }

    // Discovery rate decay
    b.timeSinceDiscovery += dt;
    b.discoveryRate = Math.max(0, b.discoveryRate - 0.1 * dt);

    // Rolling window reset (every 30s)
    b.windowTimer += dt;
    if (b.windowTimer > 30) {
      b.gazeVariety.clear();
      b.deepGazeCount = 0;
      b.revisitCount = 0;
      b.windowTimer = 0;
    }
  }

  // ─── Emotion Inference ──────────────────────────────────────────────────

  private inferEmotion(world: World, _dt: number): void {
    const b = this.behavior;
    const inf = this.inferredVector;

    // Check if currently gazed entity is already known
    const activelyGazing = this.gazedEntityId != null;
    let gazingAtDiscovered = false;
    if (activelyGazing && this.gazedEntityId != null) {
      const obs = world.getComponent(this.gazedEntityId, 'observable');
      gazingAtDiscovered = obs?.discovered ?? false;
    }

    // [0] Warmth — intentional revisitation (not drive-by), slow movement, stillness
    // Gazing at a discovered entity = returning to something known = warm
    const intentionalRevisits = b.smoothSpeed < 1.5 ? b.revisitCount : 0;
    inf[0] = clamp01(
      intentionalRevisits * 0.08 +
      (b.stillnessAccum > 5 ? 0.3 : 0) +
      (b.smoothSpeed < 0.3 ? 0.15 : 0) +
      (gazingAtDiscovered ? 0.35 : 0)
    );

    // [1] Tension — very fast/erratic movement only; no-discovery frustration
    // Running at normal exploration speed (1.5–4) should NOT be tense
    // Don't penalize for "no discoveries" if everything has been found
    const undiscoveredRemain = this.totalDiscovered < this.totalObservable;
    inf[1] = clamp01(
      (b.smoothSpeed > 5 ? 0.4 : 0) +
      (undiscoveredRemain && b.timeSinceDiscovery > 45 ? 0.25 : 0) +
      (b.smoothSpeed > 4 ? (b.smoothSpeed - 4) * 0.1 : 0)
    );

    // [2] Curiosity — gaze variety, exploration, or active study
    // Gazing at undiscovered = high curiosity; revisiting familiar = damped
    const gazeBonus = activelyGazing ? (gazingAtDiscovered ? 0.15 : 0.4) : 0;
    const familiarityDamper = gazingAtDiscovered ? 0.55 : 1.0;
    inf[2] = clamp01(
      (b.gazeVariety.size * 0.08 +
      (b.smoothSpeed > 0.5 && b.smoothSpeed < 4 ? 0.3 : 0) +
      gazeBonus) * familiarityDamper
    );

    // [3] Awe — recent discoveries, stillness after discovery
    inf[3] = clamp01(
      b.discoveryRate * 0.3 +
      (b.timeSinceDiscovery < 5 && b.stillnessAccum > 1 ? 0.4 : 0)
    );

    // [4] Melancholy — very long stillness WITHOUT focus, prolonged fruitless searching
    // Active observation (gazing at something) gates stillness-melancholy:
    // staring intently = curiosity/focus, not sadness
    // High energy/curiosity suppresses melancholy — you can't be sad while actively engaged
    const unfocusedStillness = !activelyGazing && b.stillnessAccum > 20;
    const engagementSuppression = Math.max(inf[2], inf[5]); // curiosity or energy
    inf[4] = clamp01(
      ((unfocusedStillness ? 0.3 : 0) +
      (undiscoveredRemain && b.timeSinceDiscovery > 60 ? 0.25 : 0) +
      intentionalRevisits * 0.04) * (1 - engagementSuppression * 0.7)
    );

    // [5] Energy — movement speed, discovery rate
    inf[5] = clamp01(
      b.smoothSpeed * 0.15 +
      b.discoveryRate * 0.25
    );
  }

  // ─── Resonance Calculation ──────────────────────────────────────────────

  /**
   * Resonance between player and entity emotion vectors.
   * Returns -1 (full dissonance) to +1 (full resonance).
   * Uses cosine similarity.
   */
  private calculateResonance(a: number[], b: number[]): number {
    let dot = 0, magA = 0, magB = 0;
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
      dot += a[i] * b[i];
      magA += a[i] * a[i];
      magB += b[i] * b[i];
    }
    magA = Math.sqrt(magA);
    magB = Math.sqrt(magB);
    if (magA < 0.001 || magB < 0.001) return 0;
    // Cosine similarity mapped from [0,1] to [-1,1]
    const cos = dot / (magA * magB);
    return cos * 2 - 1;
  }

  // ─── Public getters (for debug overlay and other systems via ECS query) ──

  getPlayerVector(): number[] { return [...this.playerVector]; }
  getPeakResonance(): number { return this.peakResonance; }
  getDominantEmotion(): number { return this.dominantEmotion; }
  getEntityResonance(entityId: number): number { return this.entityResonance.get(entityId) ?? 0; }
}

// ─── Utility ────────────────────────────────────────────────────────────────

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** Emotion dimension names (for debug display) */
export const EMOTION_NAMES = ['warmth', 'tension', 'curiosity', 'awe', 'melancholy', 'energy'];
