/**
 * PerceptionSystem — The heart of Minds.
 * 
 * "What you observe becomes real."
 * 
 * This system raycasts from the camera each frame to determine what the player
 * is looking at. Observed entities gain coherence; unobserved entities decay.
 * The reveal threshold creates a moment of "discovery" when something crosses
 * from fog into reality.
 */

import * as THREE from 'three';
import { System, World, EntityId } from '../core/ECS';
import { FirstPersonCamera } from '../core/FirstPersonCamera';

export class PerceptionSystem implements System {
  name = 'perception';
  requiredComponents = ['observable', 'transform'];

  private playerCamera: FirstPersonCamera;
  private raycaster: THREE.Raycaster;
  private scene: THREE.Scene;

  /** How far the player can "observe" */
  private gazeRange = 30;
  /** How wide the gaze cone is (dot product threshold; 0.95 = tight focus) */
  private gazeFocusThreshold = 0.92;

  constructor(playerCamera: FirstPersonCamera, scene: THREE.Scene) {
    this.playerCamera = playerCamera;
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = this.gazeRange;
    this.scene = scene;
  }

  update(world: World, dt: number, entities: EntityId[]): void {
    const gazeOrigin = this.playerCamera.getWorldPosition();
    const gazeDir = this.playerCamera.getGazeDirection();

    for (const id of entities) {
      const observable = world.getComponent(id, 'observable')!;
      const transform = world.getComponent(id, 'transform')!;

      // Calculate direction to entity
      const entityPos = new THREE.Vector3(transform.x, transform.y, transform.z);
      const toEntity = entityPos.clone().sub(gazeOrigin);
      const distance = toEntity.length();

      // Skip if out of range
      if (distance > this.gazeRange) {
        this.decay(observable, dt);
        continue;
      }

      // Check if player is looking at this entity (cone check)
      toEntity.normalize();
      const dot = gazeDir.dot(toEntity);

      if (dot > this.gazeFocusThreshold) {
        // Being observed — gain coherence
        // Closer + more centered = faster observation
        const distanceFactor = 1 - (distance / this.gazeRange);
        const focusFactor = (dot - this.gazeFocusThreshold) / (1 - this.gazeFocusThreshold);
        const gain = observable.gainRate * distanceFactor * focusFactor * dt;

        observable.observationLevel = Math.min(1, observable.observationLevel + gain);
        observable.totalObserveTime += dt;

        // Discovery moment!
        if (!observable.discovered && observable.observationLevel >= observable.revealThreshold) {
          observable.discovered = true;
          world.events.emit('entity_discovered', {
            entityId: id,
            observationLevel: observable.observationLevel,
          });
        }
      } else {
        // Not being observed — decay
        this.decay(observable, dt);
      }
    }
  }

  private decay(observable: any, dt: number): void {
    if (observable.observationLevel > 0) {
      observable.observationLevel = Math.max(0, observable.observationLevel - observable.decayRate * dt);
    }
  }
}
