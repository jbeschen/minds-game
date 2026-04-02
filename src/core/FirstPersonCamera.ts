/**
 * FirstPersonCamera — WASD movement + mouse look.
 * 
 * This is also the "eye of consciousness" — the camera IS the player's attention.
 * Later, the Perception System will use the camera's direction for gaze raycasting.
 */

import * as THREE from 'three';

export class FirstPersonCamera {
  readonly camera: THREE.PerspectiveCamera;
  
  /** The object that moves through space (camera is a child of this) */
  readonly body: THREE.Object3D;

  private moveSpeed = 5; // units/sec
  private lookSpeed = 0.002; // radians/pixel
  private pitch = 0; // up/down rotation (clamped)
  private yaw = 0; // left/right rotation

  // Input state
  private keys: Set<string> = new Set();
  private isLocked = false;

  // Movement vector (reused to avoid allocation)
  private moveDir = new THREE.Vector3();

  constructor() {
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.set(0, 1.6, 0); // Eye height

    this.body = new THREE.Object3D();
    this.body.add(this.camera);

    this.setupInput();
  }

  private setupInput(): void {
    document.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
    });

    document.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.isLocked) return;

      this.yaw -= e.movementX * this.lookSpeed;
      this.pitch -= e.movementY * this.lookSpeed;
      this.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.pitch));

      this.body.rotation.y = this.yaw;
      this.camera.rotation.x = this.pitch;
    });

    document.addEventListener('pointerlockchange', () => {
      this.isLocked = document.pointerLockElement !== null;
    });
  }

  /**
   * Request pointer lock (call on user click)
   */
  requestLock(element: HTMLElement): void {
    element.requestPointerLock();
  }

  /**
   * Update position based on input. Called each fixed timestep.
   */
  update(dt: number): void {
    this.moveDir.set(0, 0, 0);

    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) this.moveDir.z -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) this.moveDir.z += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) this.moveDir.x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) this.moveDir.x += 1;

    if (this.moveDir.lengthSq() > 0) {
      this.moveDir.normalize();
      this.moveDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
      this.body.position.addScaledVector(this.moveDir, this.moveSpeed * dt);
    }
  }

  /**
   * Handle window resize
   */
  resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Get the direction the camera is looking (for gaze raycasting later)
   */
  getGazeDirection(): THREE.Vector3 {
    const dir = new THREE.Vector3(0, 0, -1);
    dir.applyQuaternion(this.camera.getWorldQuaternion(new THREE.Quaternion()));
    return dir;
  }

  /**
   * Get world position of the camera (for raycasting origin)
   */
  getWorldPosition(): THREE.Vector3 {
    return this.camera.getWorldPosition(new THREE.Vector3());
  }

  // ─── Save / Load state ──────────────────────────────────────────────────

  getState(): { x: number; y: number; z: number; yaw: number; pitch: number } {
    return {
      x: this.body.position.x,
      y: this.body.position.y,
      z: this.body.position.z,
      yaw: this.yaw,
      pitch: this.pitch,
    };
  }

  setState(state: { x: number; y: number; z: number; yaw: number; pitch: number }): void {
    this.body.position.set(state.x, state.y, state.z);
    this.yaw = state.yaw;
    this.pitch = state.pitch;
    this.body.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
  }
}
