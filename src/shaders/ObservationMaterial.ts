/**
 * ObservationMaterial — The visual language of consciousness.
 *
 * A custom shader that makes entities emerge from quantum fog into solid reality
 * based on a single input: observation level (0.0 → 1.0).
 *
 * Visual stages:
 *   0.0       — Invisible. Pure void.
 *   0.0–0.3   — Quantum fog: noisy, dissolving, color barely hints through static
 *   0.3–0.6   — Forming: shape coalesces, noise recedes, color strengthens
 *   0.6–0.9   — Solid: mostly real, subtle shimmer at edges
 *   0.9–1.0   — Fully real: emissive glow, presence, the object IS
 *
 * Data-driven: observation level is the only input. Entity color is a uniform.
 * Plugin-safe: no per-entity logic — any entity with an observable component
 * gets this material automatically via the RenderSystem.
 */

import * as THREE from 'three';

// ─── Vertex Shader ───────────────────────────────────────────────────────────

const vertexShader = /* glsl */ `
  uniform float uObservation;
  uniform float uTime;

  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying vec2 vUv;
  varying float vNoise;

  //
  // Simplex-ish noise for vertex displacement
  //
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);

    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);

    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;

    i = mod289(i);
    vec4 p = permute(permute(permute(
      i.z + vec4(0.0, i1.z, i2.z, 1.0))
      + i.y + vec4(0.0, i1.y, i2.y, 1.0))
      + i.x + vec4(0.0, i1.x, i2.x, 1.0));

    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;

    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);

    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);

    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);

    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));

    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);

    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;

    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }

  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);

    // Vertex displacement: incoherent at low observation, stable at high
    float displacementStrength = (1.0 - smoothstep(0.0, 0.7, uObservation)) * 0.15;
    float noise = snoise(position * 3.0 + uTime * 0.5);
    vNoise = noise;

    vec3 displaced = position + normal * noise * displacementStrength;

    vec4 worldPos = modelMatrix * vec4(displaced, 1.0);
    vWorldPosition = worldPos.xyz;

    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

// ─── Fragment Shader ─────────────────────────────────────────────────────────

const fragmentShader = /* glsl */ `
  uniform float uObservation;
  uniform float uTime;
  uniform vec3 uColor;
  uniform vec3 uFogColor;
  uniform float uFogDensity;

  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying vec2 vUv;
  varying float vNoise;

  //
  // Hash for dissolve noise (cheaper than full simplex in frag)
  //
  float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  float noise2d(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
      f.y
    );
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    vec2 shift = vec2(100.0);
    for (int i = 0; i < 4; i++) {
      v += a * noise2d(p);
      p = p * 2.0 + shift;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    // ─── Dissolve threshold ──────────────────────────────────────
    // At low observation, noise eats away at the fragment
    float dissolveNoise = fbm(vUv * 8.0 + uTime * 0.2);
    float dissolveThreshold = uObservation * 1.4 - 0.2; // starts dissolving below ~0.15
    float dissolveMask = smoothstep(dissolveThreshold - 0.1, dissolveThreshold + 0.1, dissolveNoise);

    // Hard discard for truly invisible fragments
    if (uObservation < 0.01) discard;
    if (dissolveMask < 0.01 && uObservation < 0.5) discard;

    // ─── Base lighting (simple directional + ambient) ────────────
    vec3 lightDir = normalize(vec3(0.5, 1.0, 0.3));
    float diff = max(dot(vNormal, lightDir), 0.0);
    float ambient = 0.25;
    float lighting = ambient + diff * 0.75;

    // ─── Color stages ────────────────────────────────────────────
    // Fog phase (0.0–0.3): mostly fog color with hints of entity color
    // Forming phase (0.3–0.6): color emerges, noise recedes
    // Solid phase (0.6–1.0): full color, emissive glow at top end

    float fogBlend = 1.0 - smoothstep(0.0, 0.45, uObservation);
    vec3 baseColor = mix(uColor, uFogColor, fogBlend);

    // Static/noise overlay at low observation
    float staticNoise = hash(vUv * 200.0 + uTime * 5.0);
    float staticStrength = (1.0 - smoothstep(0.0, 0.5, uObservation)) * 0.4;
    baseColor = mix(baseColor, vec3(staticNoise * 0.3), staticStrength);

    // Apply lighting
    vec3 litColor = baseColor * lighting;

    // ─── Emissive glow at high observation ───────────────────────
    float emissiveStrength = smoothstep(0.7, 1.0, uObservation) * 0.35;
    vec3 emissive = uColor * emissiveStrength;
    litColor += emissive;

    // ─── Edge glow (rim light) — stronger when more observed ─────
    vec3 viewDir = normalize(cameraPosition - vWorldPosition);
    float rim = 1.0 - max(dot(viewDir, vNormal), 0.0);
    rim = pow(rim, 3.0);
    float rimStrength = smoothstep(0.3, 0.8, uObservation) * 0.3;
    litColor += uColor * rim * rimStrength;

    // ─── Discovery shimmer (near reveal threshold) ───────────────
    float shimmer = sin(uTime * 8.0 + vWorldPosition.y * 10.0) * 0.5 + 0.5;
    float shimmerZone = smoothstep(0.35, 0.5, uObservation) * (1.0 - smoothstep(0.5, 0.65, uObservation));
    litColor += uColor * shimmer * shimmerZone * 0.2;

    // ─── Alpha ───────────────────────────────────────────────────
    // Overall alpha ramps up with observation, modulated by dissolve
    float baseAlpha = smoothstep(0.0, 0.2, uObservation);
    float alpha = baseAlpha * mix(dissolveMask, 1.0, smoothstep(0.4, 0.7, uObservation));

    // ─── Fog (distance-based, matches scene fog) ─────────────────
    float depth = length(vWorldPosition - cameraPosition);
    float fogFactor = 1.0 - exp(-uFogDensity * depth * depth);
    litColor = mix(litColor, uFogColor, fogFactor);

    gl_FragColor = vec4(litColor, alpha);
  }
`;

// ─── Material Factory ────────────────────────────────────────────────────────

export interface ObservationMaterialOptions {
  color: THREE.Color | number;
  fogColor?: THREE.Color | number;
  fogDensity?: number;
}

/**
 * Creates a ShaderMaterial driven by observation level.
 * The only input that changes per frame is `uObservation` (0..1) and `uTime`.
 * Everything else is set once at creation.
 */
export function createObservationMaterial(
  options: ObservationMaterialOptions
): THREE.ShaderMaterial {
  const color =
    options.color instanceof THREE.Color
      ? options.color
      : new THREE.Color(options.color);

  const fogColor =
    options.fogColor instanceof THREE.Color
      ? options.fogColor
      : new THREE.Color(options.fogColor ?? 0x0a0a0f);

  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uObservation: { value: 0.0 },
      uTime: { value: 0.0 },
      uColor: { value: color },
      uFogColor: { value: fogColor },
      uFogDensity: { value: options.fogDensity ?? 0.03 },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
    blending: THREE.NormalBlending,
  });
}

/**
 * Update the observation material uniforms each frame.
 * This is the ONLY interface between the ECS and the shader.
 */
export function updateObservationMaterial(
  material: THREE.ShaderMaterial,
  observationLevel: number,
  time: number
): void {
  material.uniforms.uObservation.value = observationLevel;
  material.uniforms.uTime.value = time;

  // Enable depth write when mostly solid (prevents transparency sorting artifacts)
  material.depthWrite = observationLevel > 0.7;
}
