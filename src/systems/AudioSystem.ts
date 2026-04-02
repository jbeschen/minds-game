/**
 * AudioSystem — Sound as a response to consciousness.
 *
 * Listens to perception events on the event bus and plays spatial audio:
 *   - Discovery chime when an entity crosses its reveal threshold
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

      this.engine.playDiscoveryChime(e.observationLevel, spatial);
      this.discoveredCount++;
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

  private startAmbient(): void {
    // Base drone — very low, felt more than heard
    this.baseDrone = this.engine.createAmbientLayer(55, 'sine', 0);

    // Harmonic layer — warmer, rises with discovery
    this.harmDrone = this.engine.createAmbientLayer(110, 'triangle', 0);
  }

  /**
   * Ambient intensity scales with how much of the world has been discovered.
   * An empty world is silent. A fully observed world hums with presence.
   */
  private updateAmbientIntensity(): void {
    if (!this.baseDrone || !this.harmDrone || this.totalObservable === 0) return;

    const ratio = this.discoveredCount / this.totalObservable;

    // Base drone fades in gently
    this.baseDrone.setGain(ratio * 0.08);
    // Shift pitch up slightly as world fills
    this.baseDrone.setFrequency(55 + ratio * 15);

    // Harmonic layer comes in later, grows faster
    const harmRatio = Math.max(0, (ratio - 0.2) / 0.8); // starts at 20% discovery
    this.harmDrone.setGain(harmRatio * 0.05);
    this.harmDrone.setFrequency(110 + harmRatio * 30);
  }

  // ─── Cleanup ───────────────────────────────────────────────────────────

  destroy(): void {
    this.baseDrone?.stop();
    this.harmDrone?.stop();
    this.engine.dispose();
  }
}
