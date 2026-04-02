/**
 * RenderSystem — Bridges the ECS world and the Three.js scene.
 *
 * Responsibilities:
 * - Creates meshes with ObservationMaterial when entities gain Renderable + Transform
 * - Updates mesh transforms each frame
 * - Drives the observation shader via observable component data
 * - Removes meshes when entities are destroyed
 *
 * Plugin guardrail: This system reads `observable` component data to set shader
 * uniforms. It does NOT import or reference the PerceptionSystem. Communication
 * is purely through shared component data on the ECS.
 */

import * as THREE from 'three';
import { System, World, EntityId } from '../core/ECS';
import {
  createObservationMaterial,
  updateObservationMaterial,
} from '../shaders/ObservationMaterial';

/** Emotion dimension → tint color mapping */
const EMOTION_TINTS: THREE.Color[] = [
  new THREE.Color(0.9, 0.5, 0.3),  // warmth — warm orange
  new THREE.Color(0.7, 0.3, 0.3),  // tension — muted red
  new THREE.Color(0.3, 0.7, 0.9),  // curiosity — bright cyan
  new THREE.Color(0.6, 0.4, 0.9),  // awe — soft violet
  new THREE.Color(0.4, 0.4, 0.7),  // melancholy — steel blue
  new THREE.Color(0.9, 0.8, 0.3),  // energy — bright gold
];

export class RenderSystem implements System {
  name = 'render';
  requiredComponents = ['transform', 'renderable'];

  private scene: THREE.Scene;
  private meshes: Map<EntityId, THREE.Mesh> = new Map();

  /** Elapsed time — passed to shaders for animation */
  private elapsed = 0;

  /** Scene fog color — passed to materials so they blend into the void */
  private fogColor: THREE.Color;

  /** Scene fog density */
  private fogDensity: number;

  /** Current emotion tint (updated via events) */
  private emotionTint: THREE.Color = new THREE.Color(0.5, 0.5, 0.5);

  /** Per-entity resonance values (entityId → resonance) */
  private entityResonance: Map<EntityId, number> = new Map();

  /** Mastery levels by domain (domain → level 0..1) */
  private masteryLevels: Record<string, number> = {};

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    // Read fog params from scene (or default)
    if (scene.fog instanceof THREE.FogExp2) {
      this.fogColor = scene.fog.color;
      this.fogDensity = scene.fog.density;
    } else {
      this.fogColor = new THREE.Color(0x0a0a0f);
      this.fogDensity = 0.03;
    }
  }

  init(world: World): void {
    // Listen for entity destruction to clean up meshes
    world.events.on('entity_destroyed', (event) => {
      const mesh = this.meshes.get(event.entityId);
      if (mesh) {
        this.scene.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
        this.meshes.delete(event.entityId);
      }
    });

    // Listen to emotion state for tint and resonance
    world.events.on('emotion:state_updated', (e) => {
      const dominant = e.dominantEmotion ?? 2;
      if (dominant >= 0 && dominant < EMOTION_TINTS.length) {
        this.emotionTint.copy(EMOTION_TINTS[dominant]);
      }
      // Update per-entity resonance map
      if (e.entityResonance) {
        this.entityResonance.clear();
        for (const [idStr, res] of Object.entries(e.entityResonance)) {
          this.entityResonance.set(Number(idStr), res as number);
        }
      }
    });

    // Listen to mastery levels
    world.events.on('mastery:state_updated', (e) => {
      this.masteryLevels = e.levels ?? {};
    });
  }

  update(world: World, dt: number, entities: EntityId[]): void {
    this.elapsed += dt;

    for (const id of entities) {
      const transform = world.getComponent(id, 'transform')!;
      const renderable = world.getComponent(id, 'renderable')!;

      let mesh = this.meshes.get(id);

      // Create mesh if needed
      if (!mesh) {
        mesh = this.createMesh(renderable.meshType, renderable.color, renderable.geometryScale ?? 1);
        this.meshes.set(id, mesh);
        this.scene.add(mesh);
        renderable.initialized = true;
        renderable.meshId = mesh.uuid;
      }

      // Sync transform
      mesh.position.set(transform.x, transform.y, transform.z);
      mesh.rotation.set(transform.rotationX, transform.rotationY, transform.rotationZ);

      // Observation-driven appearance
      const observable = world.getComponent(id, 'observable');
      if (observable) {
        // Calculate gaze intensity for the shader
        // Combines whether the entity is being looked at + gaze momentum
        let gazeIntensity = 0;
        if (observable.isGazed) {
          const zoneFactor = observable.gazeZone === 'center' ? 1.0 : 0.4;
          const momentumFactor = Math.min(observable.gazeStreak / 3.0, 1.0);
          gazeIntensity = zoneFactor * (0.5 + 0.5 * momentumFactor);
        }

        // Get emotional resonance for this entity
        const emotionalField = world.getComponent(id, 'emotionalField');
        const resonance = emotionalField ? (this.entityResonance.get(id) ?? 0) : 0;

        // Get mastery glow: how much mastery the player has in this entity's domain
        const affordance = world.getComponent(id, 'masteryAffordance');
        const masteryGlow = affordance
          ? (this.masteryLevels[affordance.domain] ?? 0)
          : 0;

        // Drive the shader — this is the only interface
        updateObservationMaterial(
          mesh.material as THREE.ShaderMaterial,
          observable.observationLevel,
          this.elapsed,
          gazeIntensity,
          resonance,
          masteryGlow,
          this.emotionTint
        );

        // Scale subtly with observation (things become "more real")
        const obsScale = 0.85 + observable.observationLevel * 0.15;
        mesh.scale.set(
          transform.scaleX * obsScale,
          transform.scaleY * obsScale,
          transform.scaleZ * obsScale
        );
      } else {
        // Non-observable entities: just sync scale
        mesh.scale.set(transform.scaleX, transform.scaleY, transform.scaleZ);
      }
    }
  }

  private createMesh(type: string, color: number, geometryScale = 1): THREE.Mesh {
    let geometry: THREE.BufferGeometry;
    const s = geometryScale;

    switch (type) {
      case 'cube':
        geometry = new THREE.BoxGeometry(s, s, s);
        break;
      case 'plane':
        geometry = new THREE.PlaneGeometry(10 * s, 10 * s);
        break;
      case 'octahedron':
        geometry = new THREE.OctahedronGeometry(0.5 * s, 0);
        break;
      case 'tetrahedron':
        geometry = new THREE.TetrahedronGeometry(0.5 * s, 0);
        break;
      case 'torus':
        geometry = new THREE.TorusGeometry(0.35 * s, 0.15 * s, 16, 32);
        break;
      case 'torusknot':
        geometry = new THREE.TorusKnotGeometry(0.3 * s, 0.1 * s, 64, 16);
        break;
      case 'cylinder':
        geometry = new THREE.CylinderGeometry(0.3 * s, 0.3 * s, 1.0 * s, 16);
        break;
      case 'cone':
        geometry = new THREE.ConeGeometry(0.4 * s, 1.0 * s, 16);
        break;
      case 'icosahedron':
        geometry = new THREE.IcosahedronGeometry(0.5 * s, 0);
        break;
      case 'dodecahedron':
        geometry = new THREE.DodecahedronGeometry(0.45 * s, 0);
        break;
      case 'sphere':
      default:
        geometry = new THREE.SphereGeometry(0.5 * s, 32, 32);
        break;
    }

    const material = createObservationMaterial({
      color,
      fogColor: this.fogColor,
      fogDensity: this.fogDensity,
    });

    return new THREE.Mesh(geometry, material);
  }
}
