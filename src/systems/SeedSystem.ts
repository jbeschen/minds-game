/**
 * Seed System — The Constellation.
 * 
 * Before the world exists, the player chooses from a constellation of orbs.
 * Each seed biases the starting state: what's almost visible, what emotional
 * tone the world starts with, which mastery domains have early affordances.
 * 
 * Seeds are data-driven and moddable — story packs define their own constellations.
 */

export interface SeedConfig {
  id: string;
  /** Visual properties for the constellation orb */
  orb: {
    color: number;
    pulseRate: number;   // Hz
    luminosity: number;  // 0..1
    size: number;        // relative scale
    position: [number, number, number]; // position in constellation space
  };
  /** Biases for the Perception System */
  perception: {
    /** Entity tags that start with higher observation levels */
    nearCoherence: string[];
    /** Entity tags that start deeply hidden */
    deeplyHidden: string[];
    /** Global observation gain rate modifier */
    gainModifier: number;
  };
  /** Starting emotional field of the world */
  emotion: {
    /** Starting world emotion vector [warmth, tension, curiosity, awe, melancholy, energy] */
    worldVector: number[];
  };
  /** Which mastery domains have early affordances */
  mastery: {
    /** Domains with bonus starting affordances */
    earlyDomains: string[];
  };
  /** Narrative flags set at start */
  narrativeFlags: string[];
}

// ─── Awakening Story Seeds ────────────────────────────────────────────────────

export const AWAKENING_SEEDS: SeedConfig[] = [
  {
    id: 'ember',
    orb: {
      color: 0xff6b35,
      pulseRate: 1.2,
      luminosity: 0.8,
      size: 1.0,
      position: [2, 1, -3],
    },
    perception: {
      nearCoherence: ['warm', 'light', 'energy'],
      deeplyHidden: ['shadow', 'stillness', 'depth'],
      gainModifier: 1.1,
    },
    emotion: {
      worldVector: [0.7, 0.3, 0.4, 0.2, 0.0, 0.8], // warm, slightly tense, curious, energetic
    },
    mastery: {
      earlyDomains: ['shaping', 'kindling'],
    },
    narrativeFlags: ['fire_origin'],
  },
  {
    id: 'tide',
    orb: {
      color: 0x4ecdc4,
      pulseRate: 0.6,
      luminosity: 0.6,
      size: 1.1,
      position: [-2, 0, -4],
    },
    perception: {
      nearCoherence: ['flow', 'reflection', 'depth'],
      deeplyHidden: ['structure', 'rigidity', 'heat'],
      gainModifier: 0.9,
    },
    emotion: {
      worldVector: [0.4, 0.1, 0.6, 0.5, 0.3, 0.3], // calm, curious, awed, slightly melancholy
    },
    mastery: {
      earlyDomains: ['listening', 'navigating'],
    },
    narrativeFlags: ['water_origin'],
  },
  {
    id: 'void',
    orb: {
      color: 0x9b59b6,
      pulseRate: 0.3,
      luminosity: 0.4,
      size: 0.8,
      position: [0, -1, -5],
    },
    perception: {
      nearCoherence: ['shadow', 'silence', 'hidden'],
      deeplyHidden: ['light', 'sound', 'surface'],
      gainModifier: 1.3, // Faster observation but fewer things near coherence
    },
    emotion: {
      worldVector: [0.1, 0.5, 0.8, 0.6, 0.4, 0.1], // tense, very curious, awed, low energy
    },
    mastery: {
      earlyDomains: ['perceiving', 'darkness-walking'],
    },
    narrativeFlags: ['void_origin'],
  },
  {
    id: 'lattice',
    orb: {
      color: 0xf1c40f,
      pulseRate: 2.0,
      luminosity: 0.9,
      size: 0.9,
      position: [1, 2, -3.5],
    },
    perception: {
      nearCoherence: ['pattern', 'structure', 'connection'],
      deeplyHidden: ['chaos', 'emotion', 'instinct'],
      gainModifier: 1.0,
    },
    emotion: {
      worldVector: [0.3, 0.2, 0.9, 0.3, 0.0, 0.5], // analytical curiosity, moderate energy
    },
    mastery: {
      earlyDomains: ['patterning', 'building'],
    },
    narrativeFlags: ['order_origin'],
  },
];
