/**
 * ECS (Entity-Component-System) — The structural foundation of Mindcore.
 *
 * - Entities are just numeric IDs
 * - Components are plain data objects attached to entities
 * - Systems are logic that runs each frame on entities with matching components
 *
 * This keeps everything serializable (for save/load) and modular (for mods).
 */

import { EventBus } from './EventBus';

// ─── Types ───────────────────────────────────────────────────────────────────

export type EntityId = number;
export type ComponentType = string;
export type ComponentData = Record<string, any>;

export interface System {
  /** Unique name for this system */
  name: string;
  /** Which components an entity must have for this system to process it */
  requiredComponents: ComponentType[];
  /** Called once when the system is registered */
  init?(world: World): void;
  /** Called every frame with delta time and matching entities */
  update(world: World, dt: number, entities: EntityId[]): void;
  /** Called when the system is removed */
  destroy?(world: World): void;
}

// ─── World ───────────────────────────────────────────────────────────────────

export class World {
  readonly events: EventBus;

  private nextEntityId: EntityId = 1;
  private entities: Set<EntityId> = new Set();
  private components: Map<ComponentType, Map<EntityId, ComponentData>> = new Map();
  private systems: System[] = [];

  constructor(events: EventBus) {
    this.events = events;
  }

  // ─── Entity Management ──────────────────────────────────────────────────

  createEntity(): EntityId {
    const id = this.nextEntityId++;
    this.entities.add(id);
    this.events.emit('entity_created', { entityId: id });
    return id;
  }

  destroyEntity(id: EntityId): void {
    if (!this.entities.has(id)) return;

    // Remove all components for this entity
    for (const [type, store] of this.components) {
      if (store.has(id)) {
        store.delete(id);
        this.events.emit('component_removed', { entityId: id, componentType: type });
      }
    }

    this.entities.delete(id);
    this.events.emit('entity_destroyed', { entityId: id });
  }

  hasEntity(id: EntityId): boolean {
    return this.entities.has(id);
  }

  getAllEntities(): EntityId[] {
    return [...this.entities];
  }

  // ─── Component Management ───────────────────────────────────────────────

  addComponent(entityId: EntityId, type: ComponentType, data: ComponentData): void {
    if (!this.entities.has(entityId)) {
      console.warn(`[ECS] Cannot add component "${type}" to non-existent entity ${entityId}`);
      return;
    }

    if (!this.components.has(type)) {
      this.components.set(type, new Map());
    }

    this.components.get(type)!.set(entityId, data);
    this.events.emit('component_added', { entityId, componentType: type, data });
  }

  getComponent(entityId: EntityId, type: ComponentType): ComponentData | undefined {
    return this.components.get(type)?.get(entityId);
  }

  hasComponent(entityId: EntityId, type: ComponentType): boolean {
    return this.components.get(type)?.has(entityId) ?? false;
  }

  removeComponent(entityId: EntityId, type: ComponentType): void {
    const store = this.components.get(type);
    if (store?.has(entityId)) {
      store.delete(entityId);
      this.events.emit('component_removed', { entityId, componentType: type });
    }
  }

  /**
   * Query: get all entities that have ALL of the specified component types
   */
  query(...componentTypes: ComponentType[]): EntityId[] {
    if (componentTypes.length === 0) return [...this.entities];

    const results: EntityId[] = [];
    for (const entityId of this.entities) {
      let hasAll = true;
      for (const type of componentTypes) {
        if (!this.components.get(type)?.has(entityId)) {
          hasAll = false;
          break;
        }
      }
      if (hasAll) results.push(entityId);
    }
    return results;
  }

  // ─── System Management ──────────────────────────────────────────────────

  registerSystem(system: System): void {
    this.systems.push(system);
    system.init?.(this);
    this.events.emit('system_registered', { systemName: system.name });
  }

  removeSystem(name: string): void {
    const idx = this.systems.findIndex((s) => s.name === name);
    if (idx !== -1) {
      this.systems[idx].destroy?.(this);
      this.systems.splice(idx, 1);
      this.events.emit('system_removed', { systemName: name });
    }
  }

  /**
   * Run one tick of all systems. Called every frame from the game loop.
   */
  update(dt: number): void {
    for (const system of this.systems) {
      const entities = this.query(...system.requiredComponents);
      system.update(this, dt, entities);
    }
  }

  // ─── Serialization (Save/Load) ──────────────────────────────────────────

  serialize(): string {
    const state: Record<string, any> = {
      nextEntityId: this.nextEntityId,
      entities: [...this.entities],
      components: {} as Record<string, Record<string, ComponentData>>,
    };

    for (const [type, store] of this.components) {
      state.components[type] = {};
      for (const [entityId, data] of store) {
        state.components[type][entityId.toString()] = data;
      }
    }

    return JSON.stringify(state);
  }

  deserialize(json: string): void {
    const state = JSON.parse(json);

    // Clear current state
    this.entities.clear();
    this.components.clear();

    // Restore
    this.nextEntityId = state.nextEntityId;
    for (const id of state.entities) {
      this.entities.add(id);
    }
    for (const [type, store] of Object.entries(state.components as Record<string, Record<string, ComponentData>>)) {
      const map = new Map<EntityId, ComponentData>();
      for (const [idStr, data] of Object.entries(store)) {
        map.set(Number(idStr), data);
      }
      this.components.set(type, map);
    }

    this.events.emit('world_loaded', {});
  }
}
