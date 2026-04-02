/**
 * MasterySystem — Persistence transforms.
 *
 * "What you practice with intention becomes part of you.
 *  And then, suddenly, everything changes."
 *
 * Mastery domains track the player's repeated, intentional engagement with
 * different types of entities. The progression follows a sigmoid curve:
 *   - Early: small, steady improvements
 *   - Plateau: diminishing returns (feels like "nothing is happening")
 *   - Breakthrough: sudden qualitative leap (the world cracks open)
 *   - New plateau: at a higher level, new possibilities
 *
 * Cross-domain synergies reward curiosity: when two domains both pass a
 * threshold, a combined effect unlocks that neither domain provides alone.
 *
 * Intentional variation is rewarded: doing the exact same thing repeatedly
 * yields diminishing returns. Approaching the same domain from different
 * angles (different entities, different distances, different emotional states)
 * counts as "varied practice."
 *
 * Plugin guardrail: Reads observable/masteryAffordance/transform components,
 * emits events on the bus. No system imports.
 *
 * Mastery domains (initial set):
 *   - observation:  sustained, careful looking
 *   - listening:    stillness + attention to audio-tagged entities
 *   - resonance:    emotional alignment with entities
 *   - pattern:      discovering connections between entities
 *   - stillness:    patience, not-doing, waiting
 *   - movement:     exploration breadth, covering ground
 */

import { System, World, EntityId } from '../core/ECS';
import { FirstPersonCamera } from '../core/FirstPersonCamera';

// ─── Constants ──────────────────────────────────────────────────────────────

/** All mastery domains */
export const MASTERY_DOMAINS = [
  'observation', 'listening', 'resonance', 'pattern', 'stillness', 'movement',
] as const;

export type MasteryDomain = typeof MASTERY_DOMAINS[number];

/** Sigmoid curve parameters per breakthrough tier */
interface SigmoidTier {
  /** Mastery value at which this tier's sigmoid is centered */
  center: number;
  /** Steepness of the sigmoid transition */
  steepness: number;
  /** The breakthrough threshold — crossing this triggers an event */
  threshold: number;
}

const TIERS: SigmoidTier[] = [
  { center: 0.15, steepness: 12, threshold: 0.25 },  // First breakthrough: "I see how this works"
  { center: 0.45, steepness: 10, threshold: 0.55 },  // Second: "The world responds to my practice"
  { center: 0.75, steepness: 8,  threshold: 0.85 },  // Third: "Everything I knew was the beginning"
];

/** Cross-domain synergies: pairs of domains that produce combined effects */
const SYNERGIES: [MasteryDomain, MasteryDomain, string][] = [
  ['observation', 'stillness', 'deep_seeing'],       // See what was always there
  ['observation', 'movement', 'wide_awareness'],      // Peripheral perception expands
  ['listening', 'stillness', 'inner_hearing'],        // Hear the frequency beneath
  ['listening', 'resonance', 'empathic_attunement'],  // Feel what entities feel
  ['resonance', 'pattern', 'emotional_geometry'],     // See patterns in emotion
  ['pattern', 'movement', 'pathfinding'],             // Optimal routes reveal themselves
  ['observation', 'resonance', 'soul_gaze'],          // See emotional fields visually
  ['stillness', 'resonance', 'presence'],             // Your stillness affects the world
];

/** Synergy threshold: both domains must be above this to activate */
const SYNERGY_THRESHOLD = 0.3;

/** How quickly mastery atrophies when not practiced (per second) */
const ATROPHY_RATE = 0.001;

/** Minimum time between gaining mastery credit (prevents spam) */
const CREDIT_COOLDOWN = 0.5;

/** Variation bonus: how much extra credit for practicing differently */
const VARIATION_BONUS = 1.5;

// ─── Domain State ───────────────────────────────────────────────────────────

interface DomainState {
  /** Current mastery level 0..1 */
  level: number;
  /** Total raw practice invested */
  rawPractice: number;
  /** Which breakthrough tiers have been triggered */
  breakthroughsReached: boolean[];
  /** Time since last practice (for atrophy) */
  timeSinceLastPractice: number;
  /** Last entity that provided practice (for variation tracking) */
  lastPracticeEntityId: number;
  /** Count of consecutive same-entity practices (diminishing returns) */
  sameEntityStreak: number;
  /** Cooldown timer */
  cooldown: number;
}

// ─── MasterySystem ──────────────────────────────────────────────────────────

export class MasterySystem implements System {
  name = 'mastery';
  requiredComponents: string[] = []; // Listens to events + queries as needed

  private camera: FirstPersonCamera;
  private domains: Map<MasteryDomain, DomainState> = new Map();
  private activeSynergies: Set<string> = new Set();

  /** Behavior inference state */
  private smoothSpeed = 0;
  private stillnessTime = 0;
  private lastX = 0;
  private lastZ = 0;

  /** Map of tag → mastery domain for entity affordance lookup */
  private static readonly TAG_DOMAIN_MAP: Record<string, MasteryDomain> = {
    light: 'observation',
    reflection: 'observation',
    surface: 'observation',
    sound: 'listening',
    silence: 'listening',
    depth: 'listening',
    warm: 'resonance',
    emotion: 'resonance',
    flow: 'resonance',
    pattern: 'pattern',
    structure: 'pattern',
    connection: 'pattern',
    stillness: 'stillness',
    hidden: 'stillness',
    shadow: 'stillness',
    energy: 'movement',
    chaos: 'movement',
    instinct: 'movement',
  };

  constructor(camera: FirstPersonCamera) {
    this.camera = camera;

    // Initialize all domains
    for (const domain of MASTERY_DOMAINS) {
      this.domains.set(domain, {
        level: 0,
        rawPractice: 0,
        breakthroughsReached: TIERS.map(() => false),
        timeSinceLastPractice: 0,
        lastPracticeEntityId: -1,
        sameEntityStreak: 0,
        cooldown: 0,
      });
    }
  }

  init(world: World): void {
    const pos = this.camera.getWorldPosition();
    this.lastX = pos.x;
    this.lastZ = pos.z;

    // ─── Observation mastery from sustained gaze ────────────────────
    world.events.on('perception:observation_changed', (e) => {
      // Only grant mastery if observation is increasing meaningfully
      if (e.observationLevel > 0.3) {
        this.grantDomainCredit(world, 'observation', e.entityId, 0.02);
      }
    });

    // ─── Discovery grants mastery in the entity's primary domain ────
    world.events.on('perception:entity_discovered', (e) => {
      // Look up entity tags to determine domain
      const affordance = world.getComponent(e.entityId, 'masteryAffordance');
      if (affordance) {
        this.grantDomainCredit(world, affordance.domain as MasteryDomain, e.entityId, affordance.baseYield * 5);
      }
      // Discovery always gives a bit of observation credit
      this.grantDomainCredit(world, 'observation', e.entityId, 0.03);
    });

    // ─── Emotional resonance grants resonance mastery ───────────────
    world.events.on('emotion:state_updated', (e) => {
      if (e.peakResonance > 0.3) {
        // Strong resonance = resonance mastery
        // Use -1 as entityId since this isn't entity-specific
        this.grantDomainCredit(world, 'resonance', -1, e.peakResonance * 0.01);
      }
    });

    // ─── Apply seed early domain bonuses ────────────────────────────
    world.events.on('seed_selected', (e) => {
      if (e.seed?.mastery?.earlyDomains) {
        for (const domainName of e.seed.mastery.earlyDomains) {
          // Map seed domain names to our canonical domains
          const mapped = this.mapSeedDomain(domainName);
          if (mapped) {
            const state = this.domains.get(mapped);
            if (state) {
              state.rawPractice += 0.5;
              state.level = this.sigmoidCurve(state.rawPractice);
            }
          }
        }
      }
    });
  }

  update(world: World, dt: number, _entities: EntityId[]): void {
    const pos = this.camera.getWorldPosition();

    // ─── Track movement for movement/stillness mastery ──────────────
    const dx = pos.x - this.lastX;
    const dz = pos.z - this.lastZ;
    const instantSpeed = Math.sqrt(dx * dx + dz * dz) / Math.max(dt, 0.001);
    this.smoothSpeed = this.smoothSpeed * 0.9 + instantSpeed * 0.1;
    this.lastX = pos.x;
    this.lastZ = pos.z;

    // Stillness mastery: reward patience
    if (this.smoothSpeed < 0.2) {
      this.stillnessTime += dt;
      if (this.stillnessTime > 3) {
        // After 3s of stillness, start gaining stillness mastery
        this.grantDomainCredit(world, 'stillness', -1, 0.005 * dt);
      }
    } else {
      this.stillnessTime = 0;
    }

    // Movement mastery: reward active exploration
    if (this.smoothSpeed > 2) {
      this.grantDomainCredit(world, 'movement', -1, 0.003 * dt);
    }

    // ─── Update domain states ───────────────────────────────────────
    for (const [domain, state] of this.domains) {
      // Cooldown
      if (state.cooldown > 0) {
        state.cooldown -= dt;
      }

      // Atrophy: unused domains slowly decay
      state.timeSinceLastPractice += dt;
      if (state.timeSinceLastPractice > 30 && state.level > 0.05) {
        state.rawPractice = Math.max(0, state.rawPractice - ATROPHY_RATE * dt);
        state.level = this.sigmoidCurve(state.rawPractice);
      }

      // Check for breakthroughs
      for (let i = 0; i < TIERS.length; i++) {
        if (!state.breakthroughsReached[i] && state.level >= TIERS[i].threshold) {
          state.breakthroughsReached[i] = true;
          world.events.emit('mastery:breakthrough', {
            domain,
            tier: i,
            level: state.level,
          });
          console.log(`★ Mastery breakthrough: ${domain} tier ${i + 1} (level: ${state.level.toFixed(3)})`);
        }
      }
    }

    // ─── Check synergies ────────────────────────────────────────────
    for (const [domainA, domainB, synergyName] of SYNERGIES) {
      const stateA = this.domains.get(domainA)!;
      const stateB = this.domains.get(domainB)!;
      const active = stateA.level >= SYNERGY_THRESHOLD && stateB.level >= SYNERGY_THRESHOLD;

      if (active && !this.activeSynergies.has(synergyName)) {
        this.activeSynergies.add(synergyName);
        world.events.emit('mastery:synergy_activated', {
          synergy: synergyName,
          domains: [domainA, domainB],
          levels: [stateA.level, stateB.level],
        });
        console.log(`✦ Synergy activated: ${synergyName} (${domainA} + ${domainB})`);
      } else if (!active && this.activeSynergies.has(synergyName)) {
        this.activeSynergies.delete(synergyName);
        world.events.emit('mastery:synergy_deactivated', {
          synergy: synergyName,
          domains: [domainA, domainB],
        });
      }
    }

    // ─── Emit state for other systems ───────────────────────────────
    const levels: Record<string, number> = {};
    for (const [domain, state] of this.domains) {
      levels[domain] = state.level;
    }
    world.events.emit('mastery:state_updated', {
      levels,
      activeSynergies: [...this.activeSynergies],
    });
  }

  // ─── Grant Mastery Credit ─────────────────────────────────────────────────

  private grantDomainCredit(
    world: World,
    domain: MasteryDomain,
    entityId: number,
    amount: number
  ): void {
    const state = this.domains.get(domain);
    if (!state) return;
    if (state.cooldown > 0 && entityId !== -1) return;

    // Variation tracking: same entity = diminishing returns
    let variationMultiplier = 1;
    if (entityId !== -1) {
      if (entityId === state.lastPracticeEntityId) {
        state.sameEntityStreak++;
        variationMultiplier = 1 / (1 + state.sameEntityStreak * 0.3);
      } else {
        // Different entity = variation bonus
        variationMultiplier = state.sameEntityStreak > 2 ? VARIATION_BONUS : 1;
        state.sameEntityStreak = 0;
      }
      state.lastPracticeEntityId = entityId;
      state.cooldown = CREDIT_COOLDOWN;
    }

    const credit = amount * variationMultiplier;
    state.rawPractice += credit;
    state.level = this.sigmoidCurve(state.rawPractice);
    state.timeSinceLastPractice = 0;
  }

  // ─── Sigmoid Curve ────────────────────────────────────────────────────────

  /**
   * Multi-tier sigmoid: creates plateau → breakthrough → plateau pattern.
   * Each tier is a separate sigmoid that "activates" at different practice levels.
   * The result is a staircase-like curve with smooth transitions.
   */
  private sigmoidCurve(rawPractice: number): number {
    // Map raw practice to a 0..1 range over expected total practice
    // Expected full mastery around rawPractice ~10
    const normalized = rawPractice / 10;

    // Sum of weighted sigmoids creates the tiered curve
    let value = 0;
    const tierWeight = 1 / TIERS.length;

    for (const tier of TIERS) {
      const sigmoid = 1 / (1 + Math.exp(-tier.steepness * (normalized - tier.center)));
      value += sigmoid * tierWeight;
    }

    return Math.min(1, value);
  }

  // ─── Seed domain mapping ──────────────────────────────────────────────────

  private mapSeedDomain(seedDomain: string): MasteryDomain | null {
    const map: Record<string, MasteryDomain> = {
      shaping: 'movement',
      kindling: 'resonance',
      listening: 'listening',
      navigating: 'movement',
      perceiving: 'observation',
      'darkness-walking': 'stillness',
      patterning: 'pattern',
      building: 'pattern',
    };
    return map[seedDomain] ?? null;
  }

  // ─── Public getters (for debug overlay) ───────────────────────────────────

  getDomainLevel(domain: MasteryDomain): number {
    return this.domains.get(domain)?.level ?? 0;
  }

  getDomainLevels(): Record<string, number> {
    const levels: Record<string, number> = {};
    for (const [domain, state] of this.domains) {
      levels[domain] = state.level;
    }
    return levels;
  }

  getActiveSynergies(): string[] {
    return [...this.activeSynergies];
  }

  getBreakthroughCount(): number {
    let count = 0;
    for (const state of this.domains.values()) {
      count += state.breakthroughsReached.filter(Boolean).length;
    }
    return count;
  }

  /** Get the tag-to-domain mapping for entity spawning */
  static getTagDomainMap(): Record<string, MasteryDomain> {
    return { ...MasterySystem.TAG_DOMAIN_MAP };
  }
}
