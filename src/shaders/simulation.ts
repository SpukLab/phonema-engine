import { SIMPLEX_3D } from "./noise";

export const SIMULATION_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

// State channel layout (RGBA16F):
//   r = V — campo rápido (la forma visible, igual que antes)
//   g = tasa de cambio de V (usada para el brillo de actividad)
//   b = W — variable de recuperación lenta (tipo FitzHugh-Nagumo).
//       W se integra a partir de V y a su vez inhibe la reacción de V.
//       Esto es lo que produce quietud → tensión → liberación →
//       reorganización de forma emergente, verificado numéricamente
//       (tools/fhn_check.py) antes de escribirse aquí: sin W, el campo
//       biestable puro solo decae monótonamente hacia una meseta.
// a = sin usar.
export const SIMULATION_FRAGMENT = /* glsl */ `
precision highp float;

uniform sampler2D uPrevState;
uniform vec2 uResolution;
uniform float uTime;
uniform float uDeltaTime;
uniform float uDiffusion;
uniform float uReactionStrength;
uniform float uThermalNoise;
uniform float uEpsilon;
uniform float uGamma;
uniform float uWCoupling;

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

  vec4 prevCenter = texture2D(uPrevState, vUv);
  float center = prevCenter.r;
  float wPrev = prevCenter.b;

  float left   = texture2D(uPrevState, vec2(xL, vUv.y)).r;
  float right  = texture2D(uPrevState, vec2(xR, vUv.y)).r;
  float down   = texture2D(uPrevState, vec2(vUv.x, yD)).r;
  float up     = texture2D(uPrevState, vec2(vUv.x, yU)).r;

  float laplacian = (left + right + up + down - 4.0 * center);

  // Bistable self-interaction, ahora inhibido por W: cuando W crece
  // (tensión acumulada), suprime la reacción hasta que V cede (liberación).
  // W decae lento después, permitiendo que la tensión vuelva a construirse
  // en otro punto — reorganización, no repetición.
  float reaction = center - center * center * center - uWCoupling * wPrev;

  // Thermal fluctuation: a tiny, slowly-drifting perturbation. Its only
  // job is to seed nucleation and prevent the field from ever fully
  // freezing into a single flat domain. It must be small enough that
  // removing it changes texture, not behavior.
  vec3 noiseCoord = vec3(vUv * 3.2, uTime * 0.035);
  float thermal = fbm(noiseCoord);

  float dV = uDiffusion * laplacian + uReactionStrength * reaction + uThermalNoise * thermal;
  float nextV = center + dV * uDeltaTime;

  // Numerical safety net only — not a shaping tool. The reaction term
  // is what keeps the field near [-1, 1]; this just guards against
  // transient overshoot from explicit integration.
  nextV = clamp(nextV, -1.5, 1.5);

  // W integra V (viejo, no el ya actualizado) hacia gamma*W, en una
  // escala de tiempo mucho más lenta que V (uEpsilon pequeño). Esta
  // separación de escalas temporales es lo que produce tensión que
  // se acumula lento y se libera rápido, no un parpadeo simétrico.
  float dW = uEpsilon * (center - uGamma * wPrev);
  float nextW = clamp(wPrev + dW * uDeltaTime, -2.0, 2.0);

  float rate = (nextV - center) / max(uDeltaTime, 0.0001);

  gl_FragColor = vec4(nextV, rate, nextW, 1.0);
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
