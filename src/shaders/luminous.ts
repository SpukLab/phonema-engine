export const LUMINOUS_VERTEX = /* glsl */ `
precision highp float;

uniform sampler2D uState;
uniform float uTime;
uniform float uPointScale;
uniform float uExpansion;
uniform float uDrift;
uniform float uDebugMode;

attribute float aSeed;
attribute float aPhase;
attribute float aSize;
attribute vec3 aTangent;

varying float vActivity;
varying float vAge;
varying float vDepth;
varying float vSeed;
varying float vDebugMode;

const float PI = 3.141592653589793;

vec2 sphereUV(vec3 p) {
  vec3 n = normalize(p);
  float u = atan(n.z, n.x) / (2.0 * PI) + 0.5;
  float v = asin(clamp(n.y, -1.0, 1.0)) / PI + 0.5;
  return vec2(u, v);
}

void main() {
  vec3 base = position;
  vec3 n = normalize(base);
  vec2 uv = sphereUV(base);
  vec4 state = texture2D(uState, uv);

  // The existing simulation becomes internal climate rather than visible skin.
  float value = state.r;
  float tension = abs(state.b);
  float age = clamp(state.a, 0.0, 1.5) / 1.5;

  // Each luminous unit has its own release threshold, so the colony never
  // detaches as a single shell.
  float threshold = mix(0.035, 0.16, aSeed);
  float activity = smoothstep(threshold, threshold + 0.11, tension);

  // Weak collective envelope + local detachment. Active units gain tangential
  // momentum; when activity falls, cohesion naturally wins again.
  float coherentRadius = 0.78 + value * 0.10 - age * 0.06;
  float release = activity * (0.18 + 0.34 * aSeed) * uExpansion;

  float t1 = uTime * mix(0.055, 0.083, aSeed) + aPhase;
  float t2 = uTime * mix(0.031, 0.047, fract(aSeed * 7.13)) + aPhase * 1.71;
  float driftEnvelope = activity * activity;

  vec3 lateral = aTangent * (
    sin(t1) * 0.12 +
    cos(t2) * 0.07
  ) * driftEnvelope * uDrift;

  vec3 tangent2 = normalize(cross(n, aTangent + vec3(0.001, 0.002, 0.003)));
  lateral += tangent2 * sin(t1 * 0.61 + t2 * 0.37) * 0.08 * driftEnvelope * uDrift;

  // History reduces mobility instead of merely darkening old regions.
  float mobility = mix(1.0, 0.42, age);
  vec3 worldPos = n * (coherentRadius + release * mobility) + lateral * mobility;

  // Permanent individual bias breaks the spherical read while preserving a
  // collective centre of gravity.
  worldPos += vec3(
    sin(aPhase * 1.37) * 0.035,
    cos(aPhase * 0.91) * 0.045,
    sin(aPhase * 0.73 + 1.2) * 0.025
  );

  // DIAGNÓSTICO (Sprint debug, ver CHANGELOG): con uDebugMode=1, ignora
  // toda la física/comportamiento y usa la posición cruda del fibonacci
  // sphere. Si esto SÍ se ve como una esfera de puntos, el problema está
  // en value/tension/age/uState o en el cálculo de release/lateral, no
  // en la geometría base ni en el tamaño de punto.
  vec3 finalWorldPos = mix(worldPos, n * 0.9, uDebugMode);

  vec4 mvPosition = modelViewMatrix * vec4(finalWorldPos, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  float distanceScale = 1.0 / max(0.8, -mvPosition.z);
  float computedSize = clamp(
    aSize * uPointScale * distanceScale * (1.0 + activity * 0.65),
    1.0,
    18.0
  );

  // DIAGNÓSTICO: con uDebugMode=1, fuerza un tamaño grande fijo (40px),
  // ignorando aSize/distancia/actividad. Si esto SÍ se ve grande, el
  // problema es el cálculo de computedSize (o el hardware lo recorta
  // igual — ver el log de ALIASED_POINT_SIZE_RANGE en consola). Si NO
  // se ve ni así, el hardware está limitando gl_PointSize por debajo
  // de lo pedido, o las posiciones/atributos no están llegando al shader.
  gl_PointSize = mix(computedSize, 40.0, uDebugMode);

  vActivity = activity;
  vAge = age;
  vDepth = clamp((-mvPosition.z - 1.5) / 4.0, 0.0, 1.0);
  vSeed = aSeed;
  vDebugMode = uDebugMode;
}
`;

export const LUMINOUS_FRAGMENT = /* glsl */ `
precision highp float;

uniform vec3 uColdColor;
uniform vec3 uWarmColor;
uniform vec3 uCoreColor;
uniform float uOpacity;

varying float vActivity;
varying float vAge;
varying float vDepth;
varying float vSeed;
varying float vDebugMode;

void main() {
  vec2 p = gl_PointCoord - 0.5;
  float r = length(p);
  if (r > 0.5) discard;

  // DIAGNÓSTICO: con uDebugMode=1, blanco sólido opaco — ignora todo el
  // cálculo de color/actividad/edad/profundidad. Si esto tampoco es
  // visible, el problema no es de color/alpha, es geométrico o de
  // compilación del shader.
  if (vDebugMode > 0.5) {
    gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0);
    return;
  }

  float body = smoothstep(0.5, 0.08, r);
  float core = smoothstep(0.20, 0.0, r);

  float activation = smoothstep(0.0, 1.0, vActivity);
  vec3 dormant = mix(uColdColor * 0.28, uColdColor, 0.35 + 0.35 * vSeed);
  vec3 active = mix(uColdColor, uWarmColor, activation);
  vec3 color = mix(dormant, active, 0.35 + activation * 0.65);
  color = mix(color, uCoreColor, core * (0.18 + activation * 0.48));

  // Old light becomes quieter and denser rather than simply dying.
  float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
  color = mix(color, vec3(luma), vAge * 0.28);

  float atmosphericFade = mix(1.0, 0.50, vDepth);
  float alpha = body * uOpacity * atmosphericFade * (0.34 + activation * 0.66);

  gl_FragColor = vec4(
    color * (0.55 + core * 1.75 + activation * 0.75),
    alpha
  );
}
`;
