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
  }

  update(world: World, dt: number, entities: EntityId[]): void {
    this.elapsed += dt;

    for (const id of entities) {
      const transform = world.getComponent(id, 'transform')!;
      const renderable = world.getComponent(id, 'renderable')!;

      let mesh = this.meshes.get(id);

      // Create mesh if needed
      if (!mesh) {
        mesh = this.createMesh(renderable.meshType, renderable.color);
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
        // Drive the shader — this is the only interface
        updateObservationMaterial(
          mesh.material as THREE.ShaderMaterial,
          observable.observationLevel,
          this.elapsed
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

  private createMesh(type: string, color: number): THREE.Mesh {
    let geometry: THREE.BufferGeometry;

    switch (type) {
      case 'cube':
        geometry = new THREE.BoxGeometry(1, 1, 1);
        break;
      case 'plane':
        geometry = new THREE.PlaneGeometry(10, 10);
        break;
      case 'sphere':
      default:
        geometry = new THREE.SphereGeometry(0.5, 32, 32);
        break;
    }

    // Use the observation shader material — data-driven by observation level
    const material = createObservationMaterial({
      color,
      fogColor: this.fogColor,
      fogDensity: this.fogDensity,
    });

    return new THREE.Mesh(geometry, material);
  }
}
