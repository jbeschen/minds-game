/**
 * AudioSystem — Sound as a response to consciousness.
 *
 * Listens to perception events on the event bus and plays spatial audio:
 *   - Discovery chime when an entity crosses its reveal threshold
 *   - Milestone chord when every 5th entity is discovered
 *   - Soft ping when gaze lands on a new entity
 *   - Ambient drone that deepens as more of the world is observed
 *
 * Updates the audio listener position from the camera each frame.
 *
 * Plugin guardrail: This system only listens to events on the bus and reads
 * component data. It does NOT import other systems. The AudioEngine is a
 * dependency-free utility, not a system.
 */

import { System, World, EntityId } from '../core/ECS';
import { AudioEngine, AmbientLayerHandle } from '../audio/AudioEngine';
import { FirstPersonCamera } from '../core/FirstPersonCamera';

export class AudioSystem implements System {
  name = 'audio';
  requiredComponents: string[] = []; // Listens to events, doesn't query entities

  private engine: AudioEngine;
  private camera: FirstPersonCamera;

  /** Ambient drone layers */
  private baseDrone: AmbientLayerHandle | null = null;
  private harmDrone: AmbientLayerHandle | null = null;

  /** Count of discovered entities — drives ambient intensity */
  private discoveredCount = 0;
  /** Total entities in the world (set on init) */
  private totalObservable = 0;

  /** Cooldown to avoid rapid-fire gaze pings */
  private gazeStartCooldown = 0;

  constructor(camera: FirstPersonCamera) {
    this.camera = camera;
    this.engine = new AudioEngine();
  }

  init(world: World): void {
    // Initialize audio on first interaction (called after user click)
    this.engine.init();
    this.engine.resume();

    // Count observable entities
    this.totalObservable = world.query('observable').length;

    // ─── Discovery chime ─────────────────────────────────────────────────
    world.events.on('perception:entity_discovered', (e) => {
      const transform = world.getComponent(e.entityId, 'transform');
      const spatial = transform
        ? { x: transform.x, y: transform.y, z: transform.z }
        : undefined;

      this.discoveredCount++;

      // Recount if we didn't get a valid count at init (entities may spawn after systems)
      if (this.totalObservable === 0) {
        this.totalObservable = world.query('observable').length;
      }

      const progress = this.totalObservable > 0 ? this.discoveredCount / this.totalObservable : 0;

      // Milestone discovery (every 5th) gets a bigger sound
      if (this.discoveredCount % 5 === 0) {
        this.engine.playMilestoneChord(progress, spatial);
      } else {
        this.engine.playDiscoveryChime(e.observationLevel, spatial);
      }

      this.updateAmbientIntensity();
    });

    // ─── Gaze start ping ─────────────────────────────────────────────────
    world.events.on('perception:gaze_start', (e) => {
      if (this.gazeStartCooldown > 0) return;
      this.gazeStartCooldown = 0.3; // 300ms cooldown

      const transform = world.getComponent(e.entityId, 'transform');
      const spatial = transform
        ? { x: transform.x, y: transform.y, z: transform.z, rolloffFactor: 1.5 }
        : undefined;

      this.engine.playGazeStart(spatial);
    });

    // ─── Start ambient drones ────────────────────────────────────────────
    this.startAmbient();
  }

  update(world: World, dt: number, _entities: EntityId[]): void {
    // Update listener position from camera
    const pos = this.camera.getWorldPosition();
    const dir = this.camera.getGazeDirection();
    this.engine.updateListener(
      pos.x, pos.y, pos.z,
      dir.x, dir.y, dir.z
    );

    // Cooldown timer
    if (this.gazeStartCooldown > 0) {
      this.gazeStartCooldown -= dt;
    }

    // Ensure audio context is running (browsers can suspend it)
    this.engine.resume();
  }

  // ─── Ambient Soundscape ────────────────────────────────────────────────

  /**
   * Sacred / Solfeggio frequency progression.
   *
   * The ambient drone ascends through frequencies with esoteric significance
   * as the player discovers more of the world:
   *
   *   0%   — 136.1 Hz  "Om" — the primordial vibration, root of being
   *   10%  — 174 Hz    Foundation — grounding, security
   *   20%  — 285 Hz    Quantum cognition — cellular healing
   *   30%  — 396 Hz    Liberation — releasing fear and guilt
   *   40%  — 417 Hz    Change — facilitating transformation
   *   50%  — 528 Hz    Love frequency — DNA repair, miracles
   *   60%  — 639 Hz    Connection — harmonizing relationships
   *   70%  — 741 Hz    Intuition — awakening inner knowing
   *   80%  — 852 Hz    Spiritual order — returning to source
   *   90%+ — 963 Hz    Third eye — pineal gland activation, cosmic unity
   *
   * The base drone stays at a sub-octave of the current solfeggio tone.
   * The harmonic layer carries the solfeggio frequency itself.
   */
  private static readonly SOLFEGGIO_STEPS: [number, number][] = [
    [0.00, 136.1],  // Om
    [0.10, 174],    // Foundation
    [0.20, 285],    // Quantum cognition
    [0.30, 396],    // Liberation
    [0.40, 417],    // Change
    [0.50, 528],    // Love / transformation
    [0.60, 639],    // Connection
    [0.70, 741],    // Intuition
    [0.80, 852],    // Spiritual order
    [0.90, 963],    // Third eye / pineal
  ];

  private startAmbient(): void {
    // Base drone — sub-octave of the current solfeggio tone, very quiet
    this.baseDrone = this.engine.createAmbientLayer(68, 'sine', 0.02);

    // Harmonic layer — carries the solfeggio frequency
    this.harmDrone = this.engine.createAmbientLayer(136.1, 'triangle', 0);
  }

  /**
   * Lerp through the solfeggio scale based on discovery ratio.
   */
  private getSolfeggioFrequency(ratio: number): number {
    const steps = AudioSystem.SOLFEGGIO_STEPS;
    if (ratio <= 0) return steps[0][1];
    if (ratio >= steps[steps.length - 1][0]) return steps[steps.length - 1][1];

    // Find surrounding steps and interpolate
    for (let i = 0; i < steps.length - 1; i++) {
      const [t0, f0] = steps[i];
      const [t1, f1] = steps[i + 1];
      if (ratio >= t0 && ratio < t1) {
        const t = (ratio - t0) / (t1 - t0);
        // Smooth interpolation between sacred tones
        const smooth = t * t * (3 - 2 * t); // smoothstep
        return f0 + (f1 - f0) * smooth;
      }
    }
    return steps[steps.length - 1][1];
  }

  /**
   * Ambient intensity and frequency scale with discovery.
   * An empty world hums at Om. A fully observed world resonates at 963 Hz.
   */
  private updateAmbientIntensity(): void {
    if (!this.baseDrone || !this.harmDrone) return;

    const ratio = this.totalObservable > 0
      ? this.discoveredCount / this.totalObservable
      : 0;

    const solfeggioFreq = this.getSolfeggioFrequency(ratio);

    // Base drone: sub-octave of solfeggio, grows gently
    this.baseDrone.setGain(0.02 + ratio * 0.08);
    this.baseDrone.setFrequency(solfeggioFreq * 0.5); // One octave below

    // Harmonic layer: the solfeggio frequency itself, rises subtly with discovery
    const harmRatio = Math.max(0, (ratio - 0.1) / 0.9);
    this.harmDrone.setGain(harmRatio * 0.06);
    this.harmDrone.setFrequency(solfeggioFreq);
  }

  // ─── Cleanup ───────────────────────────────────────────────────────────

  destroy(): void {
    this.baseDrone?.stop();
    this.harmDrone?.stop();
    this.engine.dispose();
  }
}
