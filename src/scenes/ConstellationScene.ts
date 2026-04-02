/**
 * ConstellationScene — The player's first act of consciousness.
 *
 * A dark void filled with pulsing orbs. Each orb is a seed — a tuning fork
 * that sets the initial resonance of reality. The player chooses by looking
 * and clicking, guided only by intuition and visual attraction.
 *
 * This IS the parable: your first choice shapes your reality,
 * and you make it based on feeling, not information.
 */

import * as THREE from 'three';
import { SeedConfig, AWAKENING_SEEDS } from '../systems/SeedSystem';

// ─── Orb wrapper ─────────────────────────────────────────────────────────────

interface OrbInstance {
  seed: SeedConfig;
  /** The outer glow sphere */
  glowMesh: THREE.Mesh;
  /** The inner core sphere */
  coreMesh: THREE.Mesh;
  /** Group containing both */
  group: THREE.Group;
  /** Particle ring */
  particles: THREE.Points;
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
  /** Accumulated gaze time on current orb (not used for auto-select, just visual) */
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

    this.addLighting();
    this.addDustField();
    this.createOrbs(AWAKENING_SEEDS);
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

  private createOrbs(seeds: SeedConfig[]): void {
    for (const seed of seeds) {
      const group = new THREE.Group();
      const [x, y, z] = seed.orb.position;
      group.position.set(x, y, z);

      // Inner core — solid, bright
      const coreGeo = new THREE.SphereGeometry(0.18 * seed.orb.size, 32, 32);
      const coreMat = new THREE.MeshStandardMaterial({
        color: seed.orb.color,
        emissive: seed.orb.color,
        emissiveIntensity: seed.orb.luminosity * 0.8,
        roughness: 0.2,
        metalness: 0.1,
      });
      const coreMesh = new THREE.Mesh(coreGeo, coreMat);
      group.add(coreMesh);

      // Outer glow — transparent, larger
      const glowGeo = new THREE.SphereGeometry(0.35 * seed.orb.size, 32, 32);
      const glowMat = new THREE.MeshStandardMaterial({
        color: seed.orb.color,
        emissive: seed.orb.color,
        emissiveIntensity: seed.orb.luminosity * 0.3,
        transparent: true,
        opacity: 0.15,
        roughness: 1,
        metalness: 0,
        side: THREE.FrontSide,
        depthWrite: false,
      });
      const glowMesh = new THREE.Mesh(glowGeo, glowMat);
      group.add(glowMesh);

      // Point light — each orb illuminates its neighborhood
      const light = new THREE.PointLight(seed.orb.color, seed.orb.luminosity * 0.6, 4);
      group.add(light);

      // Orbiting particles
      const particles = this.createOrbParticles(seed);
      group.add(particles);

      this.constellationGroup.add(group);

      this.orbs.push({
        seed,
        glowMesh,
        coreMesh,
        group,
        particles,
        baseScale: seed.orb.size,
        hoverIntensity: 0,
      });
    }
  }

  private createOrbParticles(seed: SeedConfig): THREE.Points {
    const count = 40;
    const positions = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      // Distribute in a shell around the orb
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 0.4 * seed.orb.size + Math.random() * 0.3;
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.PointsMaterial({
      color: seed.orb.color,
      size: 0.03,
      transparent: true,
      opacity: 0.6,
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
    console.log(`✦ Seed selected: ${orb.seed.id}`);
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

    // Collect all core meshes for intersection
    const coreObjects = this.orbs.map((o) => o.glowMesh);
    const intersects = this.raycaster.intersectObjects(coreObjects);

    const prevGazed = this.gazedOrbIndex;
    if (intersects.length > 0) {
      this.gazedOrbIndex = coreObjects.indexOf(intersects[0].object as THREE.Mesh);
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

      // Hover intensity (smooth lerp)
      const targetHover = isGazed ? 1 : 0;
      orb.hoverIntensity += (targetHover - orb.hoverIntensity) * Math.min(1, 5 * dt);

      // Pulse: scale oscillation based on configured pulseRate
      const pulse = Math.sin(this.elapsed * orb.seed.orb.pulseRate * Math.PI * 2);
      const pulseScale = 1 + pulse * 0.08;

      // Hover expand
      const hoverScale = 1 + orb.hoverIntensity * 0.25;

      const totalScale = orb.baseScale * pulseScale * hoverScale;
      orb.coreMesh.scale.setScalar(totalScale);
      orb.glowMesh.scale.setScalar(totalScale * 1.0);

      // Emissive intensity — brighter on hover and pulse peak
      const coreMat = orb.coreMesh.material as THREE.MeshStandardMaterial;
      const baseEmissive = orb.seed.orb.luminosity * 0.8;
      const hoverEmissive = orb.hoverIntensity * 0.6;
      const pulseEmissive = (pulse * 0.5 + 0.5) * 0.2;
      coreMat.emissiveIntensity = baseEmissive + hoverEmissive + pulseEmissive;

      // Glow opacity — more visible on hover
      const glowMat = orb.glowMesh.material as THREE.MeshStandardMaterial;
      glowMat.opacity = 0.12 + orb.hoverIntensity * 0.2 + pulseEmissive * 0.1;

      // Particle rotation (orbit around the orb)
      orb.particles.rotation.y += (0.3 + orb.hoverIntensity * 0.5) * dt;
      orb.particles.rotation.x += 0.1 * dt;

      // Particle brightness on hover
      const particleMat = orb.particles.material as THREE.PointsMaterial;
      particleMat.opacity = 0.4 + orb.hoverIntensity * 0.5;

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
      const glowMat = orb.glowMesh.material as THREE.MeshStandardMaterial;
      glowMat.opacity = 0.3 + t * 0.5;
      orb.coreMesh.scale.setScalar(orb.baseScale * (1 + t * 0.5));
      orb.glowMesh.scale.setScalar(orb.baseScale * (1 + t * 0.8));

      // Fade non-selected orbs
      for (const other of this.orbs) {
        if (other === orb) continue;
        const cm = other.coreMesh.material as THREE.MeshStandardMaterial;
        const gm = other.glowMesh.material as THREE.MeshStandardMaterial;
        cm.emissiveIntensity = Math.max(0, cm.emissiveIntensity - dt * 2);
        gm.opacity = Math.max(0, gm.opacity - dt * 1.5);
        const pm = other.particles.material as THREE.PointsMaterial;
        pm.opacity = Math.max(0, pm.opacity - dt * 2);
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
      orb.particles.geometry.dispose();
      (orb.particles.material as THREE.Material).dispose();
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
