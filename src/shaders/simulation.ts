import { SIMPLEX_3D } from "./noise";

export const SIMULATION_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

// State channel layout (RGBA16F):
//   r = scalar field value (the organism's internal quantity)
//   g = local rate of change (used by the renderer for shading emphasis)
// b, a unused — reserved, not fabricated.
export const SIMULATION_FRAGMENT = /* glsl */ `
precision highp float;

uniform sampler2D uPrevState;
uniform vec2 uResolution;
uniform float uTime;
uniform float uDeltaTime;
uniform float uDiffusion;
uniform float uReactionStrength;
uniform float uThermalNoise;

varying vec2 vUv;

${SIMPLEX_3D}

void main() {
  vec2 texel = 1.0 / uResolution;

  // Longitude (x) wraps — this field lives on a sphere's UV space.
  // Latitude (y) does not; edges clamp. Pole distortion is an accepted
  // minor imperfection for Sprint 1, not worth a cube-topology field yet.
  float xL = mod(vUv.x - texel.x, 1.0);
  float xR = mod(vUv.x + texel.x, 1.0);
  float yD = clamp(vUv.y - texel.y, 0.0, 1.0);
  float yU = clamp(vUv.y + texel.y, 0.0, 1.0);

  float center = texture2D(uPrevState, vUv).r;
  float left   = texture2D(uPrevState, vec2(xL, vUv.y)).r;
  float right  = texture2D(uPrevState, vec2(xR, vUv.y)).r;
  float down   = texture2D(uPrevState, vec2(vUv.x, yD)).r;
  float up     = texture2D(uPrevState, vec2(vUv.x, yU)).r;

  float laplacian = (left + right + up + down - 4.0 * center);

  // Bistable self-interaction (Allen-Cahn form): the field is pulled
  // toward two stable states (+1 / -1). This alone — with zero noise —
  // produces domain formation and slow, curvature-driven coarsening as
  // domain walls migrate and merge. This is the primary source of
  // motion. It is deterministic and would run forever without noise.
  float reaction = center - center * center * center;

  // Thermal fluctuation: a tiny, slowly-drifting perturbation. Its only
  // job is to seed nucleation and prevent the field from ever fully
  // freezing into a single flat domain. It must be small enough that
  // removing it changes texture, not behavior.
  vec3 noiseCoord = vec3(vUv * 3.2, uTime * 0.035);
  float thermal = fbm(noiseCoord);

  float dV = uDiffusion * laplacian + uReactionStrength * reaction + uThermalNoise * thermal;
  float next = center + dV * uDeltaTime;

  // Numerical safety net only — not a shaping tool. The reaction term
  // is what keeps the field near [-1, 1]; this just guards against
  // transient overshoot from explicit integration.
  next = clamp(next, -1.5, 1.5);

  float rate = (next - center) / max(uDeltaTime, 0.0001);

  gl_FragColor = vec4(next, rate, 0.0, 1.0);
}
`;

export const SIMULATION_INIT_FRAGMENT = /* glsl */ `
precision highp float;
uniform vec2 uResolution;
varying vec2 vUv;

${SIMPLEX_3D}

void main() {
  // Seed the field with low-amplitude noise so the organism is already
  // "alive" on the first visible frame rather than fading in from a
  // flat, obviously-initialized state.
  float seed = fbm(vec3(vUv * 3.0, 0.0)) * 0.6;
  gl_FragColor = vec4(seed, 0.0, 0.0, 1.0);
}
`;
