/**
 * RenderSystem — Bridges the ECS world and the Three.js scene.
 * 
 * Responsibilities:
 * - Creates meshes when entities gain Renderable + Transform components
 * - Updates mesh transforms each frame
 * - Adjusts material opacity based on observation level (perception system hook)
 * - Removes meshes when entities are destroyed
 */

import * as THREE from 'three';
import { System, World, EntityId } from '../core/ECS';

export class RenderSystem implements System {
  name = 'render';
  requiredComponents = ['transform', 'renderable'];

  private scene: THREE.Scene;
  private meshes: Map<EntityId, THREE.Mesh> = new Map();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
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

  update(world: World, _dt: number, entities: EntityId[]): void {
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
      mesh.scale.set(transform.scaleX, transform.scaleY, transform.scaleZ);

      // Observation-driven appearance
      const observable = world.getComponent(id, 'observable');
      if (observable) {
        const mat = mesh.material as THREE.MeshStandardMaterial;
        mat.opacity = 0.05 + observable.observationLevel * 0.95;
        mat.transparent = observable.observationLevel < 0.99;

        // Scale subtly with observation (things become "more real")
        const obsScale = 0.8 + observable.observationLevel * 0.2;
        mesh.scale.set(
          transform.scaleX * obsScale,
          transform.scaleY * obsScale,
          transform.scaleZ * obsScale
        );
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

    const material = new THREE.MeshStandardMaterial({
      color,
      transparent: true,
      opacity: 0.05, // Start nearly invisible — observation brings things into being
    });

    return new THREE.Mesh(geometry, material);
  }
}
