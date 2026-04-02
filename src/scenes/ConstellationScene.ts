/**
 * ConstellationScene — The player's first act of consciousness.
 *
 * A dark void filled with pulsing orbs. Each orb is a seed — a tuning fork
 * that sets the initial resonance of reality. The player chooses by looking
 * and clicking, guided only by intuition and visual attraction.
 *
 * Visual state reflects exploration progress:
 *   - Unvisited seed: Dense fuzz cloud, many orbiting particles (uncollapsed potential)
 *   - Partially explored: Fuzz thins, particles reduce, core brightens
 *   - Fully discovered: Solid, clean form. All fuzz gone. Collapsed into reality.
 *
 * This IS the parable: your first choice shapes your reality,
 * and you make it based on feeling, not information.
 */

import * as THREE from 'three';
import { SeedConfig, AWAKENING_SEEDS } from '../systems/SeedSystem';
import { loadSeedProgress, AllSeedProgress, SeedProgressData } from '../systems/SeedProgress';

// ─── Orb wrapper ─────────────────────────────────────────────────────────────

interface OrbInstance {
  seed: SeedConfig;
  progress: SeedProgressData;
  /** Discovery ratio 0..1 */
  discoveryRatio: number;
  /** The outer glow sphere */
  glowMesh: THREE.Mesh;
  /** The inner core sphere */
  coreMesh: THREE.Mesh;
  /** Group containing everything */
  group: THREE.Group;
  /** Entity particles — count represents undiscovered entities */
  entityParticles: THREE.Points;
  /** Fuzz cloud — dissolves with discovery */
  fuzzCloud: THREE.Points;
  /** Base scale from config */
  baseScale: number;
  /** Current hover intensity (0..1, animated) */
  hoverIntensity: number;
}

// ─── Scene ───────────────────────────────────────────────────────────────────

export class ConstellationScene {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;

  private orbs: OrbInstance[] = [];
  private constellationGroup: THREE.Group;
  private raycaster = new THREE.Raycaster();
  /** Mouse position in normalized device coordinates (-1 to +1) */
  private mouseNDC = new THREE.Vector2(0, 0);

  /** Which orb is currently gazed at (index, or -1) */
  private gazedOrbIndex = -1;
  /** Accumulated gaze time on current orb */
  private gazeTime = 0;

  /** Slow auto-rotation speed (rad/sec) */
  private rotationSpeed = 0.08;
  /** Elapsed time for pulse animation */
  private elapsed = 0;

  /** Called when a seed is selected */
  onSeedSelected: ((seed: SeedConfig) => void) | null = null;

  /** Is the scene active? */
  private active = true;
  /** Selection flash animation progress (-1 = not selecting) */
  private selectionProgress = -1;
  private selectedOrb: OrbInstance | null = null;

  // ─── Dust field ────────────────────────────────────────────────────────────
  private dustField: THREE.Points | null = null;

  constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x020208);

    this.camera = new THREE.PerspectiveCamera(
      70,
      window.innerWidth / window.innerHeight,
      0.1,
      100
    );
    this.camera.position.set(0, 0.5, 4);
    this.camera.lookAt(0, 0, -2);

    this.constellationGroup = new THREE.Group();
    this.scene.add(this.constellationGroup);

    // Load progress from localStorage
    const progress = loadSeedProgress();

    this.addLighting();
    this.addDustField();
    this.createOrbs(AWAKENING_SEEDS, progress);
    this.setupInput();
  }

  // ─── Lighting ──────────────────────────────────────────────────────────────

  private addLighting(): void {
    // Very dim ambient — orbs provide their own light
    const ambient = new THREE.AmbientLight(0x080818, 0.3);
    this.scene.add(ambient);
  }

  // ─── Cosmic dust ───────────────────────────────────────────────────────────

  private addDustField(): void {
    const count = 800;
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 30;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 20;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 30 - 5;
      sizes[i] = Math.random() * 2 + 0.5;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const mat = new THREE.PointsMaterial({
      color: 0x334466,
      size: 0.04,
      transparent: true,
      opacity: 0.4,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.dustField = new THREE.Points(geo, mat);
    this.scene.add(this.dustField);
  }

  // ─── Orb creation ──────────────────────────────────────────────────────────

  private createOrbs(seeds: SeedConfig[], allProgress: AllSeedProgress): void {
    for (const seed of seeds) {
      const prog = allProgress[seed.id] ?? { discovered: 0, total: 0, playtime: 0, visits: 0, lastVisited: 0 };
      const ratio = prog.total > 0 ? prog.discovered / prog.total : 0;

      const group = new THREE.Group();
      const [x, y, z] = seed.orb.position;
      group.position.set(x, y, z);

      // ─── Inner core ─────────────────────────────────────────────────
      // More solid and brighter as discovery increases
      const coreGeo = new THREE.SphereGeometry(0.18 * seed.orb.size, 32, 32);
      const coreOpacity = 0.3 + ratio * 0.7; // 0.3 (unvisited) → 1.0 (fully discovered)
      const coreMat = new THREE.MeshStandardMaterial({
        color: seed.orb.color,
        emissive: seed.orb.color,
        emissiveIntensity: seed.orb.luminosity * (0.4 + ratio * 0.6),
        roughness: 0.5 - ratio * 0.3, // Gets shinier with discovery
        metalness: ratio * 0.3,
        transparent: ratio < 1,
        opacity: coreOpacity,
      });
      const coreMesh = new THREE.Mesh(coreGeo, coreMat);
      group.add(coreMesh);

      // ─── Outer glow ────────────────────────────────────────────────
      // Fades as seed becomes more solid
      const glowGeo = new THREE.SphereGeometry(0.35 * seed.orb.size, 32, 32);
      const glowMat = new THREE.MeshStandardMaterial({
        color: seed.orb.color,
        emissive: seed.orb.color,
        emissiveIntensity: seed.orb.luminosity * 0.3 * (1 - ratio * 0.5),
        transparent: true,
        opacity: 0.15 * (1 - ratio * 0.6),
        roughness: 1,
        metalness: 0,
        side: THREE.FrontSide,
        depthWrite: false,
      });
      const glowMesh = new THREE.Mesh(glowGeo, glowMat);
      group.add(glowMesh);

      // ─── Point light ───────────────────────────────────────────────
      const lightIntensity = seed.orb.luminosity * (0.4 + ratio * 0.6);
      const light = new THREE.PointLight(seed.orb.color, lightIntensity, 4);
      group.add(light);

      // ─── Fuzz cloud ────────────────────────────────────────────────
      // Dense noise shell that dissipates with discovery
      const fuzzCloud = this.createFuzzCloud(seed, ratio);
      group.add(fuzzCloud);

      // ─── Entity particles ──────────────────────────────────────────
      // Each particle represents an undiscovered entity
      const entityParticles = this.createEntityParticles(seed, prog);
      group.add(entityParticles);

      this.constellationGroup.add(group);

      this.orbs.push({
        seed,
        progress: prog,
        discoveryRatio: ratio,
        glowMesh,
        coreMesh,
        group,
        entityParticles,
        fuzzCloud,
        baseScale: seed.orb.size,
        hoverIntensity: 0,
      });
    }
  }

  /**
   * Fuzz cloud — a shell of noisy particles that represents quantum uncertainty.
   * Fully unvisited: dense, chaotic. Fully discovered: gone entirely.
   */
  private createFuzzCloud(seed: SeedConfig, discoveryRatio: number): THREE.Points {
    const fuzziness = 1 - discoveryRatio; // 1 = full fuzz, 0 = none
    const count = Math.floor(200 * fuzziness);
    const positions = new Float32Array(Math.max(count, 1) * 3);

    const baseRadius = 0.35 * seed.orb.size;

    for (let i = 0; i < count; i++) {
      // Random positions in a noisy shell around the orb
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      // Varying radii — some close, some far — gives a cloudy, uncertain look
      const r = baseRadius * (0.5 + Math.random() * 1.0);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.PointsMaterial({
      color: seed.orb.color,
      size: 0.025 + fuzziness * 0.02,
      transparent: true,
      opacity: fuzziness * 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });

    return new THREE.Points(geo, mat);
  }

  /**
   * Entity particles — each dot represents an undiscovered entity.
   * They orbit the seed at varying distances. As entities are discovered,
   * fewer particles remain. Fully discovered = no orbiting particles.
   */
  private createEntityParticles(seed: SeedConfig, progress: SeedProgressData): THREE.Points {
    const undiscovered = Math.max(0, (progress.total || 26) - progress.discovered);
    const count = undiscovered;
    const positions = new Float32Array(Math.max(count, 1) * 3);

    for (let i = 0; i < count; i++) {
      const theta = (i / Math.max(count, 1)) * Math.PI * 2 + Math.random() * 0.3;
      const phi = Math.acos(2 * Math.random() - 1);
      // Orbit at a distance proportional to the orb size
      const r = 0.45 * seed.orb.size + Math.random() * 0.35;
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    // Brighter, more distinct particles than the fuzz
    const mat = new THREE.PointsMaterial({
      color: seed.orb.color,
      size: 0.04,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });

    return new THREE.Points(geo, mat);
  }

  // ─── Input ─────────────────────────────────────────────────────────────────

  private setupInput(): void {
    document.addEventListener('mousemove', this.handleMouseMove);
    document.addEventListener('click', this.handleClick);
  }

  private handleMouseMove = (e: MouseEvent): void => {
    // Convert mouse position to NDC (-1 to +1)
    this.mouseNDC.x = (e.clientX / window.innerWidth) * 2 - 1;
    this.mouseNDC.y = -(e.clientY / window.innerHeight) * 2 + 1;
  };

  private handleClick = (): void => {
    if (!this.active || this.selectionProgress >= 0) return;
    if (this.gazedOrbIndex >= 0) {
      this.selectOrb(this.orbs[this.gazedOrbIndex]);
    }
  };

  // ─── Selection ─────────────────────────────────────────────────────────────

  private selectOrb(orb: OrbInstance): void {
    this.selectedOrb = orb;
    this.selectionProgress = 0;
    console.log(`✦ Seed selected: ${orb.seed.id} (${Math.round(orb.discoveryRatio * 100)}% discovered)`);
  }

  // ─── Update (call each frame) ──────────────────────────────────────────────

  update(dt: number): void {
    if (!this.active) return;

    this.elapsed += dt;

    // Slow constellation rotation
    this.constellationGroup.rotation.y += this.rotationSpeed * dt;

    // Dust drift
    if (this.dustField) {
      this.dustField.rotation.y += 0.005 * dt;
      this.dustField.rotation.x += 0.002 * dt;
    }

    // Gaze detection — raycast from mouse position
    this.raycaster.setFromCamera(this.mouseNDC, this.camera);

    // Collect all glow meshes for intersection (larger target)
    const hitTargets = this.orbs.map((o) => o.glowMesh);
    const intersects = this.raycaster.intersectObjects(hitTargets);

    const prevGazed = this.gazedOrbIndex;
    if (intersects.length > 0) {
      this.gazedOrbIndex = hitTargets.indexOf(intersects[0].object as THREE.Mesh);
      if (this.gazedOrbIndex === prevGazed) {
        this.gazeTime += dt;
      } else {
        this.gazeTime = 0;
      }
    } else {
      this.gazedOrbIndex = -1;
      this.gazeTime = 0;
    }

    // Animate orbs
    for (let i = 0; i < this.orbs.length; i++) {
      const orb = this.orbs[i];
      const isGazed = i === this.gazedOrbIndex;
      const isSelected = orb === this.selectedOrb;
      const ratio = orb.discoveryRatio;
      const fuzziness = 1 - ratio;

      // Hover intensity (smooth lerp)
      const targetHover = isGazed ? 1 : 0;
      orb.hoverIntensity += (targetHover - orb.hoverIntensity) * Math.min(1, 5 * dt);

      // Pulse: scale oscillation based on configured pulseRate
      const pulse = Math.sin(this.elapsed * orb.seed.orb.pulseRate * Math.PI * 2);
      // Undiscovered seeds pulse more wildly; discovered seeds are calm
      const pulseAmplitude = 0.03 + fuzziness * 0.08;
      const pulseScale = 1 + pulse * pulseAmplitude;

      // Hover expand
      const hoverScale = 1 + orb.hoverIntensity * 0.25;

      const totalScale = orb.baseScale * pulseScale * hoverScale;
      orb.coreMesh.scale.setScalar(totalScale);
      orb.glowMesh.scale.setScalar(totalScale);

      // Core emissive intensity — brighter on hover, brighter when discovered
      const coreMat = orb.coreMesh.material as THREE.MeshStandardMaterial;
      const baseEmissive = orb.seed.orb.luminosity * (0.4 + ratio * 0.6);
      const hoverEmissive = orb.hoverIntensity * 0.6;
      const pulseEmissive = (pulse * 0.5 + 0.5) * 0.2 * (0.5 + ratio * 0.5);
      coreMat.emissiveIntensity = baseEmissive + hoverEmissive + pulseEmissive;
      coreMat.opacity = (0.3 + ratio * 0.7) + orb.hoverIntensity * 0.2;

      // Glow opacity — more visible on hover, less visible when discovered
      const glowMat = orb.glowMesh.material as THREE.MeshStandardMaterial;
      glowMat.opacity = (0.15 * (1 - ratio * 0.6)) + orb.hoverIntensity * 0.2;

      // ─── Fuzz cloud animation ──────────────────────────────────────
      // Jitter the fuzz particles for a quantum-uncertain look
      const fuzzPositions = orb.fuzzCloud.geometry.attributes.position;
      if (fuzzPositions && fuzzPositions.count > 1) {
        for (let p = 0; p < fuzzPositions.count; p++) {
          const ox = fuzzPositions.getX(p);
          const oy = fuzzPositions.getY(p);
          const oz = fuzzPositions.getZ(p);
          // Subtle jitter — more chaotic when less discovered
          const jitter = fuzziness * 0.003;
          fuzzPositions.setXYZ(
            p,
            ox + (Math.random() - 0.5) * jitter,
            oy + (Math.random() - 0.5) * jitter,
            oz + (Math.random() - 0.5) * jitter
          );
        }
        fuzzPositions.needsUpdate = true;
      }

      // Fuzz opacity pulses
      const fuzzMat = orb.fuzzCloud.material as THREE.PointsMaterial;
      fuzzMat.opacity = fuzziness * (0.35 + pulse * 0.15) + orb.hoverIntensity * fuzziness * 0.2;

      // ─── Entity particles orbit ────────────────────────────────────
      orb.entityParticles.rotation.y += (0.3 + orb.hoverIntensity * 0.5) * dt;
      orb.entityParticles.rotation.x += 0.1 * dt;

      // Particle brightness on hover
      const particleMat = orb.entityParticles.material as THREE.PointsMaterial;
      particleMat.opacity = 0.5 + orb.hoverIntensity * 0.4;

      // Selection flash animation
      if (isSelected && this.selectionProgress >= 0) {
        this.animateSelection(orb, dt);
      }
    }
  }

  // ─── Selection animation ───────────────────────────────────────────────────

  private animateSelection(orb: OrbInstance, dt: number): void {
    this.selectionProgress += dt;

    // Phase 1 (0-0.8s): Selected orb flares bright, others fade
    if (this.selectionProgress < 0.8) {
      const t = this.selectionProgress / 0.8;

      // Flare the selected orb
      const coreMat = orb.coreMesh.material as THREE.MeshStandardMaterial;
      coreMat.emissiveIntensity = orb.seed.orb.luminosity + t * 3;
      coreMat.opacity = 1;
      const glowMat = orb.glowMesh.material as THREE.MeshStandardMaterial;
      glowMat.opacity = 0.3 + t * 0.5;
      orb.coreMesh.scale.setScalar(orb.baseScale * (1 + t * 0.5));
      orb.glowMesh.scale.setScalar(orb.baseScale * (1 + t * 0.8));

      // Fuzz collapses inward during selection
      const fuzzMat = orb.fuzzCloud.material as THREE.PointsMaterial;
      fuzzMat.opacity = Math.max(0, fuzzMat.opacity - dt * 2);
      orb.fuzzCloud.scale.setScalar(1 - t * 0.5);

      // Fade non-selected orbs
      for (const other of this.orbs) {
        if (other === orb) continue;
        const cm = other.coreMesh.material as THREE.MeshStandardMaterial;
        const gm = other.glowMesh.material as THREE.MeshStandardMaterial;
        cm.emissiveIntensity = Math.max(0, cm.emissiveIntensity - dt * 2);
        cm.opacity = Math.max(0, cm.opacity - dt * 1.5);
        gm.opacity = Math.max(0, gm.opacity - dt * 1.5);
        const pm = other.entityParticles.material as THREE.PointsMaterial;
        pm.opacity = Math.max(0, pm.opacity - dt * 2);
        const fm = other.fuzzCloud.material as THREE.PointsMaterial;
        fm.opacity = Math.max(0, fm.opacity - dt * 2);
      }
    }

    // Phase 2 (0.8-1.8s): Everything fades to black
    if (this.selectionProgress >= 0.8 && this.selectionProgress < 1.8) {
      const t = (this.selectionProgress - 0.8) / 1.0;
      const coreMat = orb.coreMesh.material as THREE.MeshStandardMaterial;
      coreMat.emissiveIntensity = Math.max(0, (1 - t) * 4);
      const glowMat = orb.glowMesh.material as THREE.MeshStandardMaterial;
      glowMat.opacity = Math.max(0, (1 - t) * 0.8);

      // Fade dust
      if (this.dustField) {
        const dm = this.dustField.material as THREE.PointsMaterial;
        dm.opacity = Math.max(0, 0.4 * (1 - t));
      }
    }

    // Phase 3 (1.8s+): Transition complete — fire callback
    if (this.selectionProgress >= 1.8) {
      this.active = false;
      document.removeEventListener('mousemove', this.handleMouseMove);
      document.removeEventListener('click', this.handleClick);
      this.onSeedSelected?.(orb.seed);
    }
  }

  // ─── Render (call from game loop render) ───────────────────────────────────

  render(renderer: THREE.WebGLRenderer): void {
    renderer.render(this.scene, this.camera);
  }

  // ─── Resize ────────────────────────────────────────────────────────────────

  resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  // ─── Cleanup ───────────────────────────────────────────────────────────────

  dispose(): void {
    this.active = false;
    document.removeEventListener('mousemove', this.handleMouseMove);
    document.removeEventListener('click', this.handleClick);

    // Dispose geometries and materials
    for (const orb of this.orbs) {
      orb.coreMesh.geometry.dispose();
      (orb.coreMesh.material as THREE.Material).dispose();
      orb.glowMesh.geometry.dispose();
      (orb.glowMesh.material as THREE.Material).dispose();
      orb.entityParticles.geometry.dispose();
      (orb.entityParticles.material as THREE.Material).dispose();
      orb.fuzzCloud.geometry.dispose();
      (orb.fuzzCloud.material as THREE.Material).dispose();
    }

    if (this.dustField) {
      this.dustField.geometry.dispose();
      (this.dustField.material as THREE.Material).dispose();
    }
  }

  /** Whether the scene is still running */
  get isActive(): boolean {
    return this.active;
  }
}
