import { SIMPLEX_3D } from "./noise";

export const ORGANISM_VERTEX = /* glsl */ `
uniform sampler2D uState;
uniform float uDisplacementScale;
uniform float uAgeDisplacementScale;
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

// Altura combinada: V es la forma que respira ahora mismo; S es el
// desgaste acumulado, que siempre resta (colapsa hacia adentro, nunca
// infla). Esto es lo que rompe la silueta esférica de raíz — no un
// bulto decorativo, sino una asimetría permanente que resulta de la
// propia historia de tensión del organismo.
float sampleHeight(vec2 uv) {
  vec4 s = texture2D(uState, uv);
  return s.r * uDisplacementScale - s.a * uAgeDisplacementScale;
}

void main() {
  vec2 dUv = warpUV(uv, uWarpScale, uWarpStrength, vec2(3.1, 1.7));
  float height = sampleHeight(dUv);

  vec3 displaced = position + normal * height;

  float hx1 = sampleHeight(dUv + vec2(EPS, 0.0));
  float hx0 = sampleHeight(dUv - vec2(EPS, 0.0));
  float hy1 = sampleHeight(dUv + vec2(0.0, EPS));
  float hy0 = sampleHeight(dUv - vec2(0.0, EPS));

  vec3 tangentU = normalize(cross(normal, vec3(0.0, 1.0, 0.0)) + vec3(0.0001));
  vec3 tangentV = normalize(cross(normal, tangentU));

  vec3 perturbedNormal = normalize(
    normal
    - tangentU * (hx1 - hx0) * 4.0
    - tangentV * (hy1 - hy0) * 4.0
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
uniform vec3 uPatinaColor;
uniform float uPatinaStrength;
uniform float uAOStrength;
uniform float uTensionRoughnessGain;
uniform float uTensionSubsurfaceGain;
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
//
// Two changes from the previous pass: (1) fbm (multi-octave) instead of
// a single noise call — real fracture/pore patterns are self-similar
// across scales, one octave reads as a bump map, not a material; (2) a
// fixed anisotropic stretch + rotation — a consistent "grain direction"
// across the whole surface, like fiber in tissue or foliation in rock,
// instead of isotropic blobs that read as generic procedural noise.
const float MESO_EPS = 0.006;
const float GRAIN_ANGLE = 0.6;

vec2 grainAxis(vec2 uv) {
  float s = sin(GRAIN_ANGLE);
  float c = cos(GRAIN_ANGLE);
  return vec2(uv.x * c - uv.y * s, uv.x * s + uv.y * c);
}

float mesoHeight(vec2 uv, float scale) {
  vec2 g = grainAxis(uv);
  return fbm(vec3(g.x * scale, g.y * scale * 1.9, 5.0));
}

// Variante "vieja": ridged noise (1 - |fbm|, elevado al cuadrado para
// afilar crestas) — se lee como fractura o veta cristalizada, no como
// el mismo bulto suave de la variante joven. Distintas regiones deben
// pertenecer a familias estructurales distintas, no a la misma con
// otra semilla — eso es lo que rompe "esto es procedural noise".
float mesoHeightOld(vec2 uv, float scale) {
  vec2 g = grainAxis(uv);
  float n = fbm(vec3(g.x * scale, g.y * scale * 1.9, 5.0));
  float ridged = 1.0 - abs(n);
  return ridged * ridged * 1.6 - 0.5;
}

void main() {
  vec3 Nmacro = normalize(vNormal);
  vec3 V = normalize(vViewPosition);
  vec3 L = normalize(uKeyLightDir);

  vec3 tangentU = normalize(cross(Nmacro, vec3(0.0, 1.0, 0.0)) + vec3(0.0001));
  vec3 tangentV = normalize(cross(Nmacro, tangentU));

  // Edad local: decide qué familia estructural aparece acá. No es un
  // parámetro estético — es la misma cantidad que ya deformó la malla
  // en el vertex shader, leída de nuevo para que estructura y forma
  // cuenten la misma historia.
  float ageValue = texture2D(uState, vMeshUv).a;
  float ageBlend = smoothstep(0.35, 0.8, ageValue);

  float mhYoung = mesoHeight(vMeshUv, uMesoScale);
  float mhOld = mesoHeightOld(vMeshUv, uMesoScale);
  float mh = mix(mhYoung, mhOld, ageBlend);

  float mhx = mix(
    mesoHeight(vMeshUv + vec2(MESO_EPS, 0.0), uMesoScale),
    mesoHeightOld(vMeshUv + vec2(MESO_EPS, 0.0), uMesoScale),
    ageBlend
  ) - mh;
  float mhy = mix(
    mesoHeight(vMeshUv + vec2(0.0, MESO_EPS), uMesoScale),
    mesoHeightOld(vMeshUv + vec2(0.0, MESO_EPS), uMesoScale),
    ageBlend
  ) - mh;

  vec3 N = normalize(Nmacro - tangentU * mhx * uMesoStrength - tangentV * mhy * uMesoStrength);

  float NdotL = max(dot(N, L), 0.0);
  float NdotV = max(dot(N, V), 0.0);
  float fresnel = pow(1.0 - NdotV, 2.5);

  // Fake ambient occlusion from the meso relief itself: low points (the
  // "crevices" of the same height field that bent the normal) receive
  // less light. This is what actually sells depth at close range — a
  // bent normal alone looks like a decal, occlusion makes it look cut
  // into the material.
  float occlusion = smoothstep(-0.7, 0.4, mh);
  float aoFactor = mix(1.0 - uAOStrength, 1.0, occlusion);

  // Independent warp instances (different seed, different scale) for
  // color and activity. Neither traces the same boundary curve as the
  // displacement warp or each other — real matter's tone, grain, and
  // sheen don't line up on one clean contour the way a level-set
  // visualization would.
  vec2 colorUv = warpUV(vMeshUv, uWarpScale, uColorWarpStrength, vec2(41.0, 12.0));
  vec2 activityUv = warpUV(vMeshUv, uWarpScale * 1.7, uActivityWarpStrength, vec2(7.0, 88.0));

  float field = texture2D(uState, colorUv).r;
  float rate = texture2D(uState, activityUv).g;
  // W (tensión interna acumulada, lee el mismo canal que ya calibramos
  // numéricamente). Nunca dibuja una forma propia — solo modula cuánto
  // brilla y cuánto traslucen las otras capas.
  float tension = clamp(abs(texture2D(uState, activityUv).b), 0.0, 1.0);

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

  // Patina: very low-frequency, fixed blotches — like oxidation on metal
  // or lichen on rock. Independent of the field and of the meso grain;
  // a third, coarser identity layer, not a repeat of either.
  float patina = fbm(vec3(vMeshUv * 2.2, 77.0));
  float patinaMask = smoothstep(0.25, 0.6, patina);
  float ageOnPatina = mix(0.25, 1.4, ageValue);
  albedo = mix(albedo, mix(albedo, uPatinaColor, 0.4), patinaMask * uPatinaStrength * ageOnPatina);

  // Microscopic optical response: per-pixel roughness variation (finer
  // than the mesoscale relief) modulates a real specular term. Internal
  // tension (W) widens that variation — a material under stress catches
  // light less uniformly, like strained metal or taut membrane, without
  // ever drawing tension as its own visible shape.
  float microNoise = snoise(vec3(vMeshUv * uMicroScale, 21.0));
  float roughnessVar = uRoughnessVariation * (1.0 + tension * uTensionRoughnessGain);
  float roughness = clamp(uRoughnessBase + microNoise * roughnessVar, 0.05, 1.0);
  float specExponent = mix(180.0, 8.0, roughness);
  float specIntensity = mix(1.4, 0.35, roughness);

  vec3 H = normalize(L + V);
  float spec = pow(max(dot(N, H), 0.0), specExponent) * specIntensity * uSpecularStrength;

  vec3 diffuse = albedo * uKeyLightColor * NdotL * aoFactor;
  vec3 fill = albedo * uFillColor * (1.0 - NdotL) * 0.12 * aoFactor;
  vec3 rim = uKeyLightColor * fresnel * 0.15;
  vec3 specular = uKeyLightColor * spec;

  // Subsurface translucency: a faint glow on the side away from the key
  // light, tinted by an internal color. Tension (W) adds to it directly —
  // the visual reading is "something is building up beneath the surface,"
  // which is literally true here: W is the accumulated quantity that is
  // about to force a release.
  float backLight = pow(clamp(dot(-N, L), 0.0, 1.0), 1.6);
  vec3 subsurface = uSubsurfaceColor * backLight * (uSubsurfaceStrength + tension * uTensionSubsurfaceGain);

  // Local rate of change reads as a faint sheen — sampled through its
  // own warp so the highlight never draws a clean ring around a wall.
  float activity = clamp(abs(rate) * 6.0, 0.0, 1.0);
  vec3 sheen = uKeyLightColor * activity * fresnel * 0.2;

  vec3 color = diffuse + fill + rim + specular + subsurface + sheen;

  gl_FragColor = vec4(color, 1.0);
}
`;
