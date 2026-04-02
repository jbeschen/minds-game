/**
 * PerceptionSystem — The heart of Minds.
 *
 * "What you observe becomes real."
 *
 * This system determines what the player is looking at each frame.
 * Observed entities gain coherence; unobserved entities decay and drift.
 *
 * Phase 1 features:
 *   - Center vs. peripheral gaze zones (center observes faster)
 *   - Gaze momentum (sustained focus accelerates observation)
 *   - Decoherence drift (unobserved entities wander from their anchor)
 *   - Namespaced events on the bus for other systems to react to
 *
 * Plugin guardrail: This system only reads/writes `observable` and `transform`
 * components, and emits events on the bus. No imports of other systems.
 */

import * as THREE from 'three';
import { System, World, EntityId } from '../core/ECS';
import { FirstPersonCamera } from '../core/FirstPersonCamera';

export class PerceptionSystem implements System {
  name = 'perception';
  requiredComponents = ['observable', 'transform'];

  private playerCamera: FirstPersonCamera;
  private scene: THREE.Scene;

  /** How far the player can observe */
  private gazeRange = 30;

  /** Dot product thresholds for gaze zones */
  private centerThreshold = 0.96;     // Tight center — fast observation
  private peripheralThreshold = 0.88; // Wider cone — slow observation

  /** How much gaze momentum accelerates gain (multiplier at max streak) */
  private momentumMaxMultiplier = 2.5;
  /** Seconds of sustained focus to reach max momentum */
  private momentumRampTime = 3.0;

  /** Maximum drift distance for fully unobserved entities */
  private maxDrift = 0.6;
  /** How fast entities drift (units/sec at zero observation) */
  private driftSpeed = 0.3;
  /** How fast entities snap back to anchor when observed */
  private anchorSnapSpeed = 4.0;

  /** Elapsed time for drift noise */
  private elapsed = 0;

  constructor(playerCamera: FirstPersonCamera, scene: THREE.Scene) {
    this.playerCamera = playerCamera;
    this.scene = scene;
  }

  update(world: World, dt: number, entities: EntityId[]): void {
    this.elapsed += dt;

    const gazeOrigin = this.playerCamera.getWorldPosition();
    const gazeDir = this.playerCamera.getGazeDirection();

    for (const id of entities) {
      const observable = world.getComponent(id, 'observable')!;
      const transform = world.getComponent(id, 'transform')!;

      // Set anchor on first frame (the "true" position)
      if (!observable.anchorSet) {
        observable.anchorX = transform.x;
        observable.anchorY = transform.y;
        observable.anchorZ = transform.z;
        observable.anchorSet = true;
      }

      // Calculate direction to entity anchor (not drifted position)
      const anchorPos = new THREE.Vector3(observable.anchorX, observable.anchorY, observable.anchorZ);
      const toEntity = anchorPos.clone().sub(gazeOrigin);
      const distance = toEntity.length();

      // Determine gaze zone
      let gazeZone: 'center' | 'peripheral' | 'none' = 'none';

      if (distance <= this.gazeRange) {
        toEntity.normalize();
        const dot = gazeDir.dot(toEntity);

        if (dot > this.centerThreshold) {
          gazeZone = 'center';
        } else if (dot > this.peripheralThreshold) {
          gazeZone = 'peripheral';
        }
      }

      // Track gaze state changes
      const wasGazed = observable.isGazed;
      observable.isGazed = gazeZone !== 'none';
      observable.gazeZone = gazeZone;

      if (gazeZone !== 'none') {
        // ─── Being observed ──────────────────────────────────────────
        const distanceFactor = 1 - (distance / this.gazeRange);

        // Zone multiplier: center = full speed, peripheral = 30%
        const zoneFactor = gazeZone === 'center' ? 1.0 : 0.3;

        // Momentum: sustained focus ramps up gain
        observable.gazeStreak += dt;
        const momentumT = Math.min(observable.gazeStreak / this.momentumRampTime, 1.0);
        const momentumFactor = 1.0 + (this.momentumMaxMultiplier - 1.0) * momentumT;

        const gain = observable.gainRate * distanceFactor * zoneFactor * momentumFactor * dt;
        const prevLevel = observable.observationLevel;
        observable.observationLevel = Math.min(1, observable.observationLevel + gain);
        observable.totalObserveTime += dt;

        // ─── Events ──────────────────────────────────────────────────
        // Gaze started
        if (!wasGazed) {
          world.events.emit('perception:gaze_start', {
            entityId: id,
            gazeZone,
            observationLevel: observable.observationLevel,
          });
        }

        // Observation level changed significantly (throttle to ~10% increments)
        if (Math.floor(observable.observationLevel * 10) !== Math.floor(prevLevel * 10)) {
          world.events.emit('perception:observation_changed', {
            entityId: id,
            observationLevel: observable.observationLevel,
            gazeZone,
          });
        }

        // Discovery moment!
        if (!observable.discovered && observable.observationLevel >= observable.revealThreshold) {
          observable.discovered = true;
          world.events.emit('perception:entity_discovered', {
            entityId: id,
            observationLevel: observable.observationLevel,
          });
          // Keep legacy event for backward compat
          world.events.emit('entity_discovered', {
            entityId: id,
            observationLevel: observable.observationLevel,
          });
        }
      } else {
        // ─── Not being observed ──────────────────────────────────────
        if (wasGazed) {
          observable.gazeStreak = 0;
          world.events.emit('perception:gaze_end', {
            entityId: id,
            observationLevel: observable.observationLevel,
          });
        }

        // Decay
        if (observable.observationLevel > 0) {
          observable.observationLevel = Math.max(
            0,
            observable.observationLevel - observable.decayRate * dt
          );
        }
      }

      // ─── Decoherence drift ─────────────────────────────────────────
      this.updateDrift(observable, transform, dt);
    }
  }

  /**
   * Decoherence: unobserved entities drift from their anchor position.
   * Observed entities snap back. Reality isn't fixed until you look.
   */
  private updateDrift(observable: any, transform: any, dt: number): void {
    const obs = observable.observationLevel;

    // Drift strength: inversely proportional to observation
    // Fully observed = no drift, fully unobserved = max drift
    const driftStrength = (1.0 - smoothstep(obs, 0.3, 0.8)) * this.maxDrift;

    if (driftStrength > 0.001) {
      // Wander using time-based noise unique to this entity
      const seed = observable.driftSeed;
      const t = this.elapsed * this.driftSpeed;

      // Smooth pseudo-random drift using sin combinations
      const targetDriftX = Math.sin(t * 0.7 + seed) * Math.cos(t * 0.3 + seed * 2.1) * driftStrength;
      const targetDriftY = Math.sin(t * 0.5 + seed * 1.3) * Math.cos(t * 0.4 + seed * 0.7) * driftStrength * 0.5; // Less vertical drift
      const targetDriftZ = Math.cos(t * 0.6 + seed * 0.9) * Math.sin(t * 0.35 + seed * 1.7) * driftStrength;

      // Smoothly approach target drift
      const lerpRate = 2.0 * dt;
      observable.driftX += (targetDriftX - observable.driftX) * lerpRate;
      observable.driftY += (targetDriftY - observable.driftY) * lerpRate;
      observable.driftZ += (targetDriftZ - observable.driftZ) * lerpRate;
    } else {
      // Snap drift back to zero when observed
      const snapRate = this.anchorSnapSpeed * dt;
      observable.driftX += (0 - observable.driftX) * Math.min(1, snapRate);
      observable.driftY += (0 - observable.driftY) * Math.min(1, snapRate);
      observable.driftZ += (0 - observable.driftZ) * Math.min(1, snapRate);
    }

    // Apply drift to transform (anchor + drift = visible position)
    transform.x = observable.anchorX + observable.driftX;
    transform.y = observable.anchorY + observable.driftY;
    transform.z = observable.anchorZ + observable.driftZ;
  }
}

// ─── Utility ─────────────────────────────────────────────────────────────────

/** Attempt smoothstep: 0 below edge0, 1 above edge1, smooth between */
function smoothstep(x: number, edge0: number, edge1: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
