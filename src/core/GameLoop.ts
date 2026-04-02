/**
 * GameLoop — Fixed timestep update with variable render.
 * 
 * Physics/logic runs at a fixed rate (60Hz default) for deterministic simulation.
 * Rendering runs as fast as the browser allows.
 * This is critical for emergent systems — inconsistent dt leads to inconsistent behavior.
 */

export interface GameLoopCallbacks {
  /** Fixed-rate update for game logic (dt is always the fixed timestep) */
  update(dt: number): void;
  /** Variable-rate render call (alpha is interpolation factor 0..1) */
  render(alpha: number): void;
}

export class GameLoop {
  private running = false;
  private rafId: number | null = null;
  private fixedTimestep: number; // seconds
  private accumulator = 0;
  private lastTime = 0;
  private callbacks: GameLoopCallbacks;

  /** Frames per second (for display/debug) */
  fps = 0;
  private frameCount = 0;
  private fpsTimer = 0;

  constructor(callbacks: GameLoopCallbacks, tickRate = 60) {
    this.callbacks = callbacks;
    this.fixedTimestep = 1 / tickRate;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now() / 1000;
    this.accumulator = 0;
    this.tick();
  }

  stop(): void {
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private tick = (): void => {
    if (!this.running) return;

    const now = performance.now() / 1000;
    let frameTime = now - this.lastTime;
    this.lastTime = now;

    // Clamp to prevent spiral of death on tab-away
    if (frameTime > 0.25) frameTime = 0.25;

    this.accumulator += frameTime;

    // Fixed-rate updates
    while (this.accumulator >= this.fixedTimestep) {
      this.callbacks.update(this.fixedTimestep);
      this.accumulator -= this.fixedTimestep;
    }

    // Render with interpolation factor
    const alpha = this.accumulator / this.fixedTimestep;
    this.callbacks.render(alpha);

    // FPS counter
    this.frameCount++;
    this.fpsTimer += frameTime;
    if (this.fpsTimer >= 1) {
      this.fps = this.frameCount;
      this.frameCount = 0;
      this.fpsTimer -= 1;
    }

    this.rafId = requestAnimationFrame(this.tick);
  };
}
