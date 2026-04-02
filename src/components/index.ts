/**
 * Component Definitions — Standard data shapes for the Mindcore ECS.
 * 
 * Components are pure data. No logic here — that lives in Systems.
 * Every component is serializable (no functions, no circular refs).
 * Mods can define their own components; these are the built-in set.
 */

// ─── Transform ────────────────────────────────────────────────────────────────

export interface TransformComponent {
  x: number;
  y: number;
  z: number;
  rotationX: number;
  rotationY: number;
  rotationZ: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
}

export function createTransform(
  x = 0, y = 0, z = 0
): TransformComponent {
  return {
    x, y, z,
    rotationX: 0, rotationY: 0, rotationZ: 0,
    scaleX: 1, scaleY: 1, scaleZ: 1,
  };
}

// ─── Observable (Perception System) ───────────────────────────────────────────

export interface ObservableComponent {
  /** Current observation level: 0.0 = quantum fog, 1.0 = fully real */
  observationLevel: number;
  /** Rate at which observation decays per second when not observed */
  decayRate: number;
  /** Rate at which observation increases per second when observed */
  gainRate: number;
  /** Minimum observation level before this entity reveals behavior */
  revealThreshold: number;
  /** Has this entity been "discovered" (crossed threshold at least once)? */
  discovered: boolean;
  /** Total time this entity has been observed (for mastery tracking) */
  totalObserveTime: number;

  // ─── Gaze momentum (Phase 1) ──────────────────────────────────────────────
  /** Consecutive seconds of sustained focus (resets when gaze leaves) */
  gazeStreak: number;
  /** Is this entity currently being gazed at? */
  isGazed: boolean;
  /** Gaze zone: 'center' | 'peripheral' | 'none' */
  gazeZone: 'center' | 'peripheral' | 'none';

  // ─── Decoherence drift (Phase 1) ──────────────────────────────────────────
  /** Position drift offset — entities wander when unobserved */
  driftX: number;
  driftY: number;
  driftZ: number;
  /** Drift seed — unique per entity for varied drift patterns */
  driftSeed: number;
  /** The "pinned" position — where the entity snaps to when fully observed */
  anchorX: number;
  anchorY: number;
  anchorZ: number;
  /** Has the anchor been set? */
  anchorSet: boolean;
}

export function createObservable(
  decayRate = 0.05,
  gainRate = 0.15,
  revealThreshold = 0.5
): ObservableComponent {
  return {
    observationLevel: 0,
    decayRate,
    gainRate,
    revealThreshold,
    discovered: false,
    totalObserveTime: 0,
    gazeStreak: 0,
    isGazed: false,
    gazeZone: 'none',
    driftX: 0,
    driftY: 0,
    driftZ: 0,
    driftSeed: Math.random() * 1000,
    anchorX: 0,
    anchorY: 0,
    anchorZ: 0,
    anchorSet: false,
  };
}

// ─── Renderable (links entity to a Three.js mesh) ────────────────────────────

export interface RenderableComponent {
  /** Geometry type or custom mesh reference */
  meshType: 'sphere' | 'cube' | 'plane' | 'custom';
  /** Base color (hex) */
  color: number;
  /** Whether this mesh has been created in the scene */
  initialized: boolean;
  /** Three.js object UUID (set at runtime, not serialized meaningfully) */
  meshId: string | null;
}

export function createRenderable(
  meshType: RenderableComponent['meshType'] = 'sphere',
  color: number = 0xffffff
): RenderableComponent {
  return { meshType, color, initialized: false, meshId: null };
}

// ─── Emotional Field (Emotion System) ─────────────────────────────────────────

export interface EmotionalFieldComponent {
  /** Emotion vector — multi-dimensional. Dimensions TBD but start with: 
   *  [warmth, tension, curiosity, awe, melancholy, energy]
   */
  vector: number[];
  /** How far this field's influence extends */
  radius: number;
  /** How strongly this field pushes on the player's emotional state */
  intensity: number;
}

export function createEmotionalField(
  vector: number[] = [0, 0, 0, 0, 0, 0],
  radius = 5,
  intensity = 0.3
): EmotionalFieldComponent {
  return { vector, radius, intensity };
}

// ─── Mastery Affordance (Mastery System) ──────────────────────────────────────

export interface MasteryAffordanceComponent {
  /** Which mastery domain this entity offers practice in */
  domain: string;
  /** How much mastery credit each interaction gives */
  baseYield: number;
  /** Does this affordance reward variation? */
  rewardsVariation: boolean;
}

export function createMasteryAffordance(
  domain: string,
  baseYield = 0.01,
  rewardsVariation = true
): MasteryAffordanceComponent {
  return { domain, baseYield, rewardsVariation };
}

// ─── Seed Orb (for constellation scene) ───────────────────────────────────────

export interface SeedOrbComponent {
  /** Visual pulse frequency (Hz) */
  pulseRate: number;
  /** Base color (hex) */
  color: number;
  /** Luminosity (0..1) */
  luminosity: number;
  /** Seed config key — maps to a seed JSON config */
  seedId: string;
}

export function createSeedOrb(
  seedId: string,
  color: number,
  pulseRate = 1,
  luminosity = 0.7
): SeedOrbComponent {
  return { seedId, color, pulseRate, luminosity };
}
