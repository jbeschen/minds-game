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

const EMOTION_NAMES = ['warmth', 'tension', 'curiosity', 'awe', 'melancholy', 'energy'];

export class DebugOverlay {
  private el: HTMLDivElement;
  private visible = false;

  // Cached state from events
  private playerVector: number[] = [0, 0, 0, 0, 0, 0];
  private dominantEmotion = 2;
  private peakResonance = 0;
  private masteryLevels: Record<string, number> = {};
  private activeSynergies: string[] = [];

  private unsubs: (() => void)[] = [];

  constructor(events: EventBus) {
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
  };

  update(): void {
    if (!this.visible) return;

    const lines: string[] = [];

    // ─── Emotion ───────────────────────────────────
    lines.push('═══ EMOTION ═══');
    for (let i = 0; i < EMOTION_NAMES.length; i++) {
      const val = this.playerVector[i] ?? 0;
      const bar = this.bar(val);
      const marker = i === this.dominantEmotion ? ' ◄' : '';
      lines.push(`  ${EMOTION_NAMES[i].padEnd(12)} ${bar} ${val.toFixed(3)}${marker}`);
    }
    lines.push(`  resonance     ${this.peakResonance >= 0 ? '+' : ''}${this.peakResonance.toFixed(3)}`);
    lines.push('');

    // ─── Mastery ───────────────────────────────────
    lines.push('═══ MASTERY ═══');
    const domains = Object.keys(this.masteryLevels).sort();
    for (const domain of domains) {
      const val = this.masteryLevels[domain];
      const bar = this.bar(val);
      lines.push(`  ${domain.padEnd(12)} ${bar} ${val.toFixed(3)}`);
    }

    if (this.activeSynergies.length > 0) {
      lines.push('');
      lines.push('  synergies:');
      for (const s of this.activeSynergies) {
        lines.push(`    ✦ ${s}`);
      }
    }

    lines.push('');
    lines.push('[F3] toggle debug');

    this.el.textContent = lines.join('\n');
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
