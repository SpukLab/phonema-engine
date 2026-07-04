import { SIMPLEX_3D } from "./noise";

export const ORGANISM_VERTEX = /* glsl */ `
uniform sampler2D uState;
uniform float uDisplacementScale;
uniform float uWarpScale;
uniform float uWarpStrength;

varying vec3 vNormal;
varying vec3 vViewPosition;
varying vec2 vMeshUv;

// Finite-difference epsilon in UV space for reconstructing a normal
// perturbed by the field, so shading reads the internal state directly
// rather than only the silhouette.
const float EPS = 0.01;

${SIMPLEX_3D}

// Fixed spatial warp — a function of position only, never of time.
// This is material heterogeneity (grain direction), not a second
// simulated process: it keeps a domain wall's rendered silhouette from
// ever being a perfect, recognizable curvature-flow arc.
vec2 warpUV(vec2 uv, float scale, float strength, vec2 seed) {
  float wx = snoise(vec3(uv * scale + seed, 0.0));
  float wy = snoise(vec3(uv * scale + seed + vec2(19.19, 7.73), 1.0));
  return uv + vec2(wx, wy) * strength;
}

float sampleField(vec2 uv) {
  return texture2D(uState, uv).r;
}

void main() {
  vec2 dUv = warpUV(uv, uWarpScale, uWarpStrength, vec2(3.1, 1.7));
  float field = sampleField(dUv);

  vec3 displaced = position + normal * field * uDisplacementScale;

  float fx1 = sampleField(dUv + vec2(EPS, 0.0));
  float fx0 = sampleField(dUv - vec2(EPS, 0.0));
  float fy1 = sampleField(dUv + vec2(0.0, EPS));
  float fy0 = sampleField(dUv - vec2(0.0, EPS));

  vec3 tangentU = normalize(cross(normal, vec3(0.0, 1.0, 0.0)) + vec3(0.0001));
  vec3 tangentV = normalize(cross(normal, tangentU));

  vec3 perturbedNormal = normalize(
    normal
    - tangentU * (fx1 - fx0) * uDisplacementScale * 4.0
    - tangentV * (fy1 - fy0) * uDisplacementScale * 4.0
  );

  vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);
  vViewPosition = -mvPosition.xyz;
  vNormal = normalize(normalMatrix * perturbedNormal);
  vMeshUv = uv;

  gl_Position = projectionMatrix * mvPosition;
}
`;

export const ORGANISM_FRAGMENT = /* glsl */ `
precision highp float;

uniform sampler2D uState;
uniform vec3 uKeyLightDir;
uniform vec3 uKeyLightColor;
uniform vec3 uFillColor;
uniform vec3 uBaseColorLow;
uniform vec3 uBaseColorHigh;
uniform vec3 uSubsurfaceColor;
uniform float uSubsurfaceStrength;
uniform float uTime;
uniform float uWarpScale;
uniform float uColorWarpStrength;
uniform float uActivityWarpStrength;
uniform float uGrainScale;
uniform float uGrainStrength;
uniform float uMesoScale;
uniform float uMesoStrength;
uniform float uMicroScale;
uniform float uRoughnessBase;
uniform float uRoughnessVariation;
uniform float uSpecularStrength;

varying vec3 vNormal;
varying vec3 vViewPosition;
varying vec2 vMeshUv;

${SIMPLEX_3D}

vec2 warpUV(vec2 uv, float scale, float strength, vec2 seed) {
  float wx = snoise(vec3(uv * scale + seed, 0.0));
  float wy = snoise(vec3(uv * scale + seed + vec2(19.19, 7.73), 1.0));
  return uv + vec2(wx, wy) * strength;
}

// Mesoscopic structure: fixed surface relief — like pores, facets, or
// grain boundaries — that exists independently of the field. It is a
// property of the material's skin, not a rendering of internal state.
const float MESO_EPS = 0.006;

float mesoHeight(vec2 uv, float scale) {
  return snoise(vec3(uv * scale, 5.0));
}

void main() {
  vec3 Nmacro = normalize(vNormal);
  vec3 V = normalize(vViewPosition);
  vec3 L = normalize(uKeyLightDir);

  // Perturb the macro (field-driven) normal with a fixed mesoscale
  // relief pattern, one octave finer than the domain-wall warp scale
  // and one octave coarser than the micro optical variation below —
  // a genuinely separate spatial frequency, not a rendering trick tied
  // to the simulation.
  vec3 tangentU = normalize(cross(Nmacro, vec3(0.0, 1.0, 0.0)) + vec3(0.0001));
  vec3 tangentV = normalize(cross(Nmacro, tangentU));

  float mh  = mesoHeight(vMeshUv, uMesoScale);
  float mhx = mesoHeight(vMeshUv + vec2(MESO_EPS, 0.0), uMesoScale) - mh;
  float mhy = mesoHeight(vMeshUv + vec2(0.0, MESO_EPS), uMesoScale) - mh;

  vec3 N = normalize(Nmacro - tangentU * mhx * uMesoStrength - tangentV * mhy * uMesoStrength);

  float NdotL = max(dot(N, L), 0.0);
  float NdotV = max(dot(N, V), 0.0);
  float fresnel = pow(1.0 - NdotV, 2.5);

  // Independent warp instances (different seed, different scale) for
  // color and activity. Neither traces the same boundary curve as the
  // displacement warp or each other — real matter's tone, grain, and
  // sheen don't line up on one clean contour the way a level-set
  // visualization would.
  vec2 colorUv = warpUV(vMeshUv, uWarpScale, uColorWarpStrength, vec2(41.0, 12.0));
  vec2 activityUv = warpUV(vMeshUv, uWarpScale * 1.7, uActivityWarpStrength, vec2(7.0, 88.0));

  float field = texture2D(uState, colorUv).r;
  float rate = texture2D(uState, activityUv).g;

  // Soft threshold instead of a linear ramp — avoids the flat
  // two-plateau "phase diagram" look of a raw bistable field read
  // straight into color.
  float t = smoothstep(-0.6, 0.6, field);

  // Fine, field-independent grain: a material property (like mineral
  // impurities in stone), not new information about the organism's
  // state. Its coordinate space is the mesh, not the field.
  float grain = snoise(vec3(vMeshUv * uGrainScale, uTime * 0.01));
  t = clamp(t + grain * uGrainStrength, 0.0, 1.0);

  vec3 albedo = mix(uBaseColorLow, uBaseColorHigh, t);

  // Microscopic optical response: per-pixel roughness variation (finer
  // than the mesoscale relief) modulates a real specular term. Rougher
  // patches scatter a light, dim highlight; smoother patches catch a
  // tight glint — the difference between a dull and a polished facet
  // on the same piece of oxidized metal or mineral.
  float microNoise = snoise(vec3(vMeshUv * uMicroScale, 21.0));
  float roughness = clamp(uRoughnessBase + microNoise * uRoughnessVariation, 0.05, 1.0);
  float specExponent = mix(180.0, 8.0, roughness);
  float specIntensity = mix(1.4, 0.35, roughness);

  vec3 H = normalize(L + V);
  float spec = pow(max(dot(N, H), 0.0), specExponent) * specIntensity * uSpecularStrength;

  vec3 diffuse = albedo * uKeyLightColor * NdotL;
  vec3 fill = albedo * uFillColor * (1.0 - NdotL) * 0.4;
  vec3 rim = uKeyLightColor * fresnel * 0.15;
  vec3 specular = uKeyLightColor * spec;

  // Subsurface translucency: a faint glow on the side away from the
  // key light, tinted by an internal color — the cue that the surface
  // has thickness and something is happening beneath it, not that it
  // is an opaque shell.
  float backLight = pow(clamp(dot(-N, L), 0.0, 1.0), 1.6);
  vec3 subsurface = uSubsurfaceColor * backLight * uSubsurfaceStrength;

  // Local rate of change reads as a faint sheen — sampled through its
  // own warp so the highlight never draws a clean ring around a wall.
  float activity = clamp(abs(rate) * 6.0, 0.0, 1.0);
  vec3 sheen = uKeyLightColor * activity * fresnel * 0.2;

  vec3 color = diffuse + fill + rim + specular + subsurface + sheen;

  gl_FragColor = vec4(color, 1.0);
}
`;
