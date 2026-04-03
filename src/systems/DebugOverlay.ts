/**
 * DebugOverlay — Numeric readout of emotion and mastery system state.
 *
 * Toggle with F3. Shows in the top-right corner:
 *   - Player emotion vector (6 dimensions)
 *   - Dominant emotion name
 *   - Peak resonance value
 *   - All mastery domain levels
 *   - Active synergies
 *   - Breakthrough count
 *
 * This is a pure UI utility — listens to events, never imports systems.
 */

import { EventBus } from '../core/EventBus';
import { World } from '../core/ECS';

const EMOTION_NAMES = ['warmth', 'tension', 'curiosity', 'awe', 'melancholy', 'energy'];

export class DebugOverlay {
  private el: HTMLDivElement;
  private visible = false;
  private world: World;

  // Session timer
  private elapsed = 0;

  // Cached state from events
  private playerVector: number[] = [0, 0, 0, 0, 0, 0];
  private dominantEmotion = 2;
  private peakResonance = 0;
  private masteryLevels: Record<string, number> = {};
  private activeSynergies: string[] = [];
  private allDiscovered = false;

  // Gazed entity info
  private gazedEntityId: number | null = null;
  private gazedEntityName: string = '';
  private gazedEntityEmotion: number[] | null = null;
  private gazedEntityResonance = 0;

  private unsubs: (() => void)[] = [];

  constructor(events: EventBus, world: World, private entityNames: Map<number, string>) {
    this.world = world;
    // Create DOM element
    this.el = document.createElement('div');
    Object.assign(this.el.style, {
      position: 'fixed',
      top: '10px',
      right: '10px',
      padding: '10px 14px',
      fontFamily: '"Courier New", monospace',
      fontSize: '11px',
      lineHeight: '1.5',
      color: '#aaffaa',
      background: 'rgba(0, 0, 0, 0.75)',
      border: '1px solid rgba(100, 255, 100, 0.2)',
      borderRadius: '4px',
      zIndex: '300',
      pointerEvents: 'none',
      display: 'none',
      whiteSpace: 'pre',
      minWidth: '260px',
    });
    document.body.appendChild(this.el);

    // Subscribe to events
    this.unsubs.push(
      events.on('emotion:state_updated', (e) => {
        this.playerVector = e.playerVector ?? this.playerVector;
        this.dominantEmotion = e.dominantEmotion ?? this.dominantEmotion;
        this.peakResonance = e.peakResonance ?? this.peakResonance;
        this.allDiscovered = e.allDiscovered ?? false;
        // Update gazed entity info
        const gid = e.gazedEntityId;
        if (gid != null) {
          this.gazedEntityId = gid;
          this.gazedEntityName = this.entityNames.get(gid) ?? `#${gid}`;
          const field = this.world.getComponent(gid, 'emotionalField');
          this.gazedEntityEmotion = field?.vector ?? null;
          this.gazedEntityResonance = e.entityResonance?.[gid] ?? 0;
        } else {
          this.gazedEntityId = null;
          this.gazedEntityName = '';
          this.gazedEntityEmotion = null;
          this.gazedEntityResonance = 0;
        }
      }),
      events.on('mastery:state_updated', (e) => {
        this.masteryLevels = e.levels ?? this.masteryLevels;
        this.activeSynergies = e.activeSynergies ?? this.activeSynergies;
      })
    );

    // Toggle with F3
    document.addEventListener('keydown', this.handleKey);
  }

  private handleKey = (e: KeyboardEvent): void => {
    if (e.code === 'F3') {
      e.preventDefault();
      this.visible = !this.visible;
      this.el.style.display = this.visible ? 'block' : 'none';
    }
    if (e.code === 'F4') {
      e.preventDefault();
      const text = this.buildLines().join('\n');
      navigator.clipboard.writeText(text).then(() => {
        console.log('📋 Debug snapshot copied to clipboard');
      });
    }
  };

  private formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  private buildLines(): string[] {
    const lines: string[] = [];
    lines.push(`t=${this.formatTime(this.elapsed)}`);
    lines.push('');

    // ─── Emotion ───────────────────────────────────
    lines.push('EMOTION');
    for (let i = 0; i < EMOTION_NAMES.length; i++) {
      const val = this.playerVector[i] ?? 0;
      const marker = i === this.dominantEmotion ? ' ◄' : '';
      lines.push(`  ${EMOTION_NAMES[i].padEnd(12)} ${val.toFixed(3)}${marker}`);
    }
    lines.push(`  resonance     ${this.peakResonance >= 0 ? '+' : ''}${this.peakResonance.toFixed(3)}`);
    if (this.allDiscovered) {
      lines.push('  (all discovered)');
    }

    // ─── Gazed Entity ──────────────────────────────
    if (this.gazedEntityId != null) {
      lines.push('');
      lines.push(`GAZING: ${this.gazedEntityName}`);
      if (this.gazedEntityEmotion) {
        for (let i = 0; i < EMOTION_NAMES.length; i++) {
          const val = this.gazedEntityEmotion[i] ?? 0;
          lines.push(`  ${EMOTION_NAMES[i].padEnd(12)} ${val.toFixed(2)}`);
        }
      }
      lines.push(`  resonance     ${this.gazedEntityResonance >= 0 ? '+' : ''}${this.gazedEntityResonance.toFixed(3)}`);
      const affordance = this.world.getComponent(this.gazedEntityId, 'masteryAffordance');
      if (affordance) {
        lines.push(`  domain        ${affordance.domain}`);
      }
    }

    // ─── Mastery ───────────────────────────────────
    lines.push('');
    lines.push('MASTERY');
    const domains = Object.keys(this.masteryLevels).sort();
    for (const domain of domains) {
      const val = this.masteryLevels[domain];
      lines.push(`  ${domain.padEnd(12)} ${val.toFixed(3)}`);
    }

    if (this.activeSynergies.length > 0) {
      lines.push('  synergies:');
      for (const s of this.activeSynergies) {
        lines.push(`    ${s}`);
      }
    }

    return lines;
  }

  update(dt: number): void {
    this.elapsed += dt;
    if (!this.visible) return;

    const lines = this.buildLines();

    // Add visual bars and footer for on-screen display
    const displayLines: string[] = [];
    displayLines.push(`t=${this.formatTime(this.elapsed)}`);
    displayLines.push('');
    displayLines.push('═══ EMOTION ═══');
    for (let i = 0; i < EMOTION_NAMES.length; i++) {
      const val = this.playerVector[i] ?? 0;
      const bar = this.bar(val);
      const marker = i === this.dominantEmotion ? ' ◄' : '';
      displayLines.push(`  ${EMOTION_NAMES[i].padEnd(12)} ${bar} ${val.toFixed(3)}${marker}`);
    }
    displayLines.push(`  resonance     ${this.peakResonance >= 0 ? '+' : ''}${this.peakResonance.toFixed(3)}`);
    if (this.allDiscovered) {
      displayLines.push('  (all discovered)');
    }
    displayLines.push('');

    if (this.gazedEntityId != null) {
      displayLines.push(`═══ GAZING: ${this.gazedEntityName} ═══`);
      if (this.gazedEntityEmotion) {
        for (let i = 0; i < EMOTION_NAMES.length; i++) {
          const val = this.gazedEntityEmotion[i] ?? 0;
          displayLines.push(`  ${EMOTION_NAMES[i].padEnd(12)} ${val.toFixed(2)}`);
        }
      }
      displayLines.push(`  resonance     ${this.gazedEntityResonance >= 0 ? '+' : ''}${this.gazedEntityResonance.toFixed(3)}`);
      const affordance = this.world.getComponent(this.gazedEntityId, 'masteryAffordance');
      if (affordance) {
        displayLines.push(`  domain        ${affordance.domain}`);
      }
      displayLines.push('');
    }

    displayLines.push('═══ MASTERY ═══');
    const domains = Object.keys(this.masteryLevels).sort();
    for (const domain of domains) {
      const val = this.masteryLevels[domain];
      const bar = this.bar(val);
      displayLines.push(`  ${domain.padEnd(12)} ${bar} ${val.toFixed(3)}`);
    }
    if (this.activeSynergies.length > 0) {
      displayLines.push('');
      displayLines.push('  synergies:');
      for (const s of this.activeSynergies) {
        displayLines.push(`    ✦ ${s}`);
      }
    }
    displayLines.push('');
    displayLines.push('[F3] toggle  [F4] copy snapshot');

    this.el.textContent = displayLines.join('\n');
  }

  private bar(value: number, width = 12): string {
    const filled = Math.round(value * width);
    return '█'.repeat(filled) + '░'.repeat(width - filled);
  }

  dispose(): void {
    document.removeEventListener('keydown', this.handleKey);
    for (const unsub of this.unsubs) unsub();
    if (this.el.parentNode) {
      this.el.parentNode.removeChild(this.el);
    }
  }
}
