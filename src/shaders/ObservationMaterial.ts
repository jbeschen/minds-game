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
  uniform float uGazeIntensity; // 0 = not gazed, 1 = center gaze with momentum
  uniform float uResonance;     // -1 = dissonance, 0 = neutral, 1 = full resonance
  uniform float uMasteryGlow;   // 0..1 — combined mastery influence on this entity

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

    // Resonance: positive resonance makes geometry "breathe" gently
    // Dissonance makes geometry jitter/vibrate
    if (uResonance > 0.05) {
      float breathe = sin(uTime * 1.5) * uResonance * 0.04;
      displaced += normal * breathe;
    } else if (uResonance < -0.05) {
      float jitter = snoise(position * 8.0 + uTime * 3.0) * abs(uResonance) * 0.03;
      displaced += normal * jitter;
    }

    vec4 worldPos = modelMatrix * vec4(displaced, 1.0);
    vWorldPosition = worldPos.xyz;

    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

// ─── Fragment Shader ─────────────────────────────────────────────────────────

const fragmentShader = /* glsl */ `
  uniform float uObservation;
  uniform float uTime;
  uniform float uGazeIntensity;
  uniform float uResonance;      // -1..1 — emotional resonance with player
  uniform float uMasteryGlow;    // 0..1 — mastery system influence
  uniform vec3 uEmotionTint;     // RGB tint from dominant player emotion
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

    // ─── Active gaze feedback ─────────────────────────────────────
    // When the player is looking at this entity, it brightens subtly
    // This is the "being seen" response — reality acknowledging the observer
    float gazePulse = sin(uTime * 4.0) * 0.5 + 0.5;
    float gazeGlow = uGazeIntensity * 0.2 * (0.7 + gazePulse * 0.3);
    litColor += uColor * gazeGlow;

    // Gaze also tightens the rim (entity "focuses" when observed)
    float gazeRim = rim * uGazeIntensity * 0.25;
    litColor += uColor * gazeRim;

    // ─── Emotional resonance effects ──────────────────────────────
    // Positive resonance: entity glows warmly, colors saturate, gentle pulse
    if (uResonance > 0.05) {
      float resPulse = sin(uTime * 2.0 + vWorldPosition.y * 3.0) * 0.5 + 0.5;
      // Warm glow from resonance — blend toward emotion tint
      vec3 resonanceGlow = mix(uColor, uEmotionTint, uResonance * 0.4);
      litColor += resonanceGlow * uResonance * 0.3 * (0.7 + resPulse * 0.3);
      // Color saturation boost
      float luminance = dot(litColor, vec3(0.299, 0.587, 0.114));
      litColor = mix(vec3(luminance), litColor, 1.0 + uResonance * 0.5);
    }
    // Negative resonance (dissonance): desaturate, cool shift, visual noise
    if (uResonance < -0.05) {
      float dissonance = abs(uResonance);
      // Desaturate
      float luminance = dot(litColor, vec3(0.299, 0.587, 0.114));
      litColor = mix(litColor, vec3(luminance), dissonance * 0.6);
      // Cool shift (push toward blue)
      litColor += vec3(-0.05, -0.02, 0.08) * dissonance;
      // Visual static overlay increases with dissonance
      float disNoise = hash(vUv * 150.0 + uTime * 8.0);
      litColor = mix(litColor, vec3(disNoise * 0.2), dissonance * 0.25);
    }

    // ─── Mastery glow ───────────────────────────────────────────────
    // Entities in domains the player has mastered gain a subtle inner light
    if (uMasteryGlow > 0.01) {
      // Soft pulsing inner glow, frequency increases with mastery level
      float masteryPulse = sin(uTime * (1.0 + uMasteryGlow * 3.0)) * 0.5 + 0.5;
      litColor += uColor * uMasteryGlow * 0.25 * (0.6 + masteryPulse * 0.4);
      // At high mastery, entities gain a subtle secondary color halo
      float haloRim = pow(rim, 2.0) * uMasteryGlow * 0.4;
      litColor += uEmotionTint * haloRim;
    }

    // ─── Alpha ───────────────────────────────────────────────────
    // Overall alpha ramps up with observation, modulated by dissolve
    float baseAlpha = smoothstep(0.0, 0.2, uObservation);
    float alpha = baseAlpha * mix(dissolveMask, 1.0, smoothstep(0.4, 0.7, uObservation));

    // Gaze boosts alpha slightly (easier to see what you're looking at)
    alpha = min(1.0, alpha + uGazeIntensity * 0.1);

    // Resonance boosts alpha (resonant entities are easier to see)
    alpha = min(1.0, alpha + max(0.0, uResonance) * 0.15);

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
      uGazeIntensity: { value: 0.0 },
      uResonance: { value: 0.0 },
      uMasteryGlow: { value: 0.0 },
      uEmotionTint: { value: new THREE.Color(0.5, 0.5, 0.5) },
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
 *
 * @param gazeIntensity 0 = not being looked at, 1 = center gaze with full momentum
 * @param resonance -1..1 — emotional resonance between player and this entity
 * @param masteryGlow 0..1 — mastery system's influence on this entity
 * @param emotionTint RGB color tint from the player's dominant emotion
 */
export function updateObservationMaterial(
  material: THREE.ShaderMaterial,
  observationLevel: number,
  time: number,
  gazeIntensity = 0,
  resonance = 0,
  masteryGlow = 0,
  emotionTint?: THREE.Color
): void {
  material.uniforms.uObservation.value = observationLevel;
  material.uniforms.uTime.value = time;
  material.uniforms.uGazeIntensity.value = gazeIntensity;
  material.uniforms.uResonance.value = resonance;
  material.uniforms.uMasteryGlow.value = masteryGlow;
  if (emotionTint) {
    material.uniforms.uEmotionTint.value.copy(emotionTint);
  }

  // Enable depth write when mostly solid (prevents transparency sorting artifacts)
  material.depthWrite = observationLevel > 0.7;
}
