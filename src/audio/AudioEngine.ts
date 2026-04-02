/**
 * AudioEngine — Thin wrapper over the Web Audio API.
 *
 * Provides:
 *   - AudioContext lifecycle (create, resume on user gesture, suspend)
 *   - Spatial 3D audio via PannerNode (sounds come from entities)
 *   - Per-sound gain and filter control
 *   - Master bus with compressor
 *   - Procedural tone generation (oscillators for discovery cues, ambient hum)
 *   - Sample loading and playback (for future asset-based sounds)
 *
 * This is NOT an ECS system — it's a utility. The AudioSystem (ECS) uses this
 * engine to play sounds in response to game events.
 *
 * Plugin guardrail: This module has zero game logic. It only knows about audio.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SpatialOptions {
  x: number;
  y: number;
  z: number;
  /** How quickly sound falls off with distance (default 1) */
  rolloffFactor?: number;
  /** Maximum distance at which sound is audible (default 30) */
  maxDistance?: number;
  /** Reference distance for volume calculation (default 1) */
  refDistance?: number;
}

export interface ToneOptions {
  /** Frequency in Hz */
  frequency: number;
  /** Oscillator type */
  type?: OscillatorType;
  /** Duration in seconds */
  duration: number;
  /** Volume 0-1 */
  gain?: number;
  /** Attack time in seconds */
  attack?: number;
  /** Release time in seconds */
  release?: number;
  /** Optional spatial positioning */
  spatial?: SpatialOptions;
  /** Detune in cents */
  detune?: number;
}

export interface AmbientLayerHandle {
  /** Update the gain (0-1) */
  setGain(gain: number): void;
  /** Update the frequency */
  setFrequency(freq: number): void;
  /** Update the spatial position */
  setPosition(x: number, y: number, z: number): void;
  /** Stop and clean up */
  stop(): void;
}

// ─── Engine ──────────────────────────────────────────────────────────────────

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;

  /** Listener position (updated from camera each frame) */
  private listenerPos = { x: 0, y: 0, z: 0 };
  private listenerForward = { x: 0, y: 0, z: -1 };
  private listenerUp = { x: 0, y: 1, z: 0 };

  /** Master volume (0-1) */
  private _volume = 0.5;

  /** Sample cache */
  private sampleCache: Map<string, AudioBuffer> = new Map();

  // ─── Init (must be called from a user gesture) ─────────────────────────

  /**
   * Initialize the AudioContext. Call this from a click/keypress handler
   * to satisfy browser autoplay restrictions.
   */
  init(): void {
    if (this.ctx) return;

    this.ctx = new AudioContext();

    // Master chain: source → compressor → masterGain → destination
    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -24;
    this.compressor.knee.value = 12;
    this.compressor.ratio.value = 4;
    this.compressor.attack.value = 0.003;
    this.compressor.release.value = 0.25;

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this._volume;

    this.compressor.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);
  }

  /** Resume if suspended (browsers suspend until user gesture) */
  resume(): void {
    if (this.ctx?.state === 'suspended') {
      this.ctx.resume();
    }
  }

  get isReady(): boolean {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  get volume(): number {
    return this._volume;
  }

  set volume(v: number) {
    this._volume = Math.max(0, Math.min(1, v));
    if (this.masterGain) {
      this.masterGain.gain.value = this._volume;
    }
  }

  // ─── Listener (camera position) ────────────────────────────────────────

  updateListener(
    posX: number, posY: number, posZ: number,
    forwardX: number, forwardY: number, forwardZ: number,
    upX = 0, upY = 1, upZ = 0
  ): void {
    if (!this.ctx) return;

    this.listenerPos = { x: posX, y: posY, z: posZ };
    this.listenerForward = { x: forwardX, y: forwardY, z: forwardZ };
    this.listenerUp = { x: upX, y: upY, z: upZ };

    const listener = this.ctx.listener;
    if (listener.positionX) {
      // Modern API
      listener.positionX.value = posX;
      listener.positionY.value = posY;
      listener.positionZ.value = posZ;
      listener.forwardX.value = forwardX;
      listener.forwardY.value = forwardY;
      listener.forwardZ.value = forwardZ;
      listener.upX.value = upX;
      listener.upY.value = upY;
      listener.upZ.value = upZ;
    } else {
      // Legacy API fallback
      listener.setPosition(posX, posY, posZ);
      listener.setOrientation(forwardX, forwardY, forwardZ, upX, upY, upZ);
    }
  }

  // ─── Procedural Tones ──────────────────────────────────────────────────

  /**
   * Play a one-shot procedural tone with envelope.
   * Used for discovery cues, gaze feedback, etc.
   */
  playTone(options: ToneOptions): void {
    if (!this.ctx || !this.compressor) return;

    const {
      frequency, duration,
      type = 'sine',
      gain = 0.3,
      attack = 0.05,
      release = 0.3,
      spatial,
      detune = 0,
    } = options;

    const now = this.ctx.currentTime;

    // Oscillator
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = frequency;
    osc.detune.value = detune;

    // Gain envelope
    const gainNode = this.ctx.createGain();
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(gain, now + attack);
    gainNode.gain.setValueAtTime(gain, now + duration - release);
    gainNode.gain.linearRampToValueAtTime(0, now + duration);

    // Routing
    osc.connect(gainNode);

    if (spatial) {
      const panner = this.createPanner(spatial);
      gainNode.connect(panner);
      panner.connect(this.compressor);
    } else {
      gainNode.connect(this.compressor);
    }

    osc.start(now);
    osc.stop(now + duration + 0.1);

    // Cleanup
    osc.onended = () => {
      osc.disconnect();
      gainNode.disconnect();
    };
  }

  /**
   * Play a discovery chime — a rising harmonic sequence.
   * The pitch and color vary based on the observation level.
   */
  playDiscoveryChime(observationLevel: number, spatial?: SpatialOptions): void {
    if (!this.ctx) return;

    // Base frequency rises with observation level
    const baseFreq = 300 + observationLevel * 200;

    // Three-note rising arpeggio
    const notes = [1, 1.25, 1.5]; // root, major third, fifth
    const noteDelay = 0.08;

    for (let i = 0; i < notes.length; i++) {
      setTimeout(() => {
        this.playTone({
          frequency: baseFreq * notes[i],
          type: 'sine',
          duration: 0.6 - i * 0.1,
          gain: 0.15 - i * 0.02,
          attack: 0.02,
          release: 0.3,
          spatial,
        });
      }, i * noteDelay * 1000);
    }

    // Soft harmonic shimmer on top
    this.playTone({
      frequency: baseFreq * 2,
      type: 'triangle',
      duration: 0.8,
      gain: 0.06,
      attack: 0.1,
      release: 0.5,
      spatial,
    });
  }

  /**
   * Play a soft gaze-start sound — a gentle tonal "ping".
   */
  playGazeStart(spatial?: SpatialOptions): void {
    this.playTone({
      frequency: 440,
      type: 'sine',
      duration: 0.15,
      gain: 0.06,
      attack: 0.01,
      release: 0.12,
      spatial,
    });
  }

  // ─── Ambient Layers ────────────────────────────────────────────────────

  /**
   * Create a continuous ambient drone layer.
   * Returns a handle to control gain, frequency, and position over time.
   * Used for the world ambient that responds to observation density.
   */
  createAmbientLayer(
    frequency: number,
    type: OscillatorType = 'sine',
    initialGain = 0,
    spatial?: SpatialOptions
  ): AmbientLayerHandle | null {
    if (!this.ctx || !this.compressor) return null;

    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = frequency;

    // Second oscillator slightly detuned for richness
    const osc2 = this.ctx.createOscillator();
    osc2.type = type;
    osc2.frequency.value = frequency;
    osc2.detune.value = 5; // 5 cents sharp — slow beating

    const gainNode = this.ctx.createGain();
    gainNode.gain.value = initialGain;

    // Low-pass filter to keep it soft
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 800;
    filter.Q.value = 0.5;

    let panner: PannerNode | null = null;

    osc.connect(gainNode);
    osc2.connect(gainNode);
    gainNode.connect(filter);

    if (spatial) {
      panner = this.createPanner(spatial);
      filter.connect(panner);
      panner.connect(this.compressor);
    } else {
      filter.connect(this.compressor);
    }

    osc.start();
    osc2.start();

    let stopped = false;

    return {
      setGain: (g: number) => {
        if (!stopped) {
          gainNode.gain.linearRampToValueAtTime(
            Math.max(0, Math.min(1, g)),
            (this.ctx?.currentTime ?? 0) + 0.1
          );
        }
      },
      setFrequency: (f: number) => {
        if (!stopped) {
          osc.frequency.linearRampToValueAtTime(f, (this.ctx?.currentTime ?? 0) + 0.2);
          osc2.frequency.linearRampToValueAtTime(f, (this.ctx?.currentTime ?? 0) + 0.2);
        }
      },
      setPosition: (x: number, y: number, z: number) => {
        if (panner && !stopped) {
          panner.positionX.value = x;
          panner.positionY.value = y;
          panner.positionZ.value = z;
        }
      },
      stop: () => {
        if (stopped) return;
        stopped = true;
        const t = (this.ctx?.currentTime ?? 0);
        gainNode.gain.linearRampToValueAtTime(0, t + 0.5);
        setTimeout(() => {
          osc.stop();
          osc2.stop();
          osc.disconnect();
          osc2.disconnect();
          gainNode.disconnect();
          filter.disconnect();
          panner?.disconnect();
        }, 600);
      },
    };
  }

  // ─── Sample Loading (for future use) ───────────────────────────────────

  async loadSample(url: string): Promise<AudioBuffer | null> {
    if (!this.ctx) return null;
    if (this.sampleCache.has(url)) return this.sampleCache.get(url)!;

    try {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
      this.sampleCache.set(url, audioBuffer);
      return audioBuffer;
    } catch (err) {
      console.warn(`[AudioEngine] Failed to load sample: ${url}`, err);
      return null;
    }
  }

  playSample(buffer: AudioBuffer, gain = 0.5, spatial?: SpatialOptions): void {
    if (!this.ctx || !this.compressor) return;

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    const gainNode = this.ctx.createGain();
    gainNode.gain.value = gain;

    source.connect(gainNode);

    if (spatial) {
      const panner = this.createPanner(spatial);
      gainNode.connect(panner);
      panner.connect(this.compressor);
    } else {
      gainNode.connect(this.compressor);
    }

    source.start();
    source.onended = () => {
      source.disconnect();
      gainNode.disconnect();
    };
  }

  // ─── Internal ──────────────────────────────────────────────────────────

  private createPanner(spatial: SpatialOptions): PannerNode {
    const panner = this.ctx!.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = spatial.refDistance ?? 1;
    panner.maxDistance = spatial.maxDistance ?? 30;
    panner.rolloffFactor = spatial.rolloffFactor ?? 1;
    panner.positionX.value = spatial.x;
    panner.positionY.value = spatial.y;
    panner.positionZ.value = spatial.z;
    return panner;
  }

  // ─── Cleanup ───────────────────────────────────────────────────────────

  dispose(): void {
    this.ctx?.close();
    this.ctx = null;
    this.masterGain = null;
    this.compressor = null;
    this.sampleCache.clear();
  }
}
