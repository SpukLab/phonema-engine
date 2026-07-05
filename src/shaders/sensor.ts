export const SENSOR_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

// Downsample de caja: para cada celda de la grilla chica, promedia una
// muestra de puntos del campo real. No es una simulación — es un sensor
// que observa, nunca escribe. Salida:
//   r = actividad local promedio (|rate|, canal G del estado)
//   g = varianza local de esa actividad dentro del bloque
//   b = tensión local promedio (|W|, canal B del estado)
export const SENSOR_FRAGMENT = /* glsl */ `
precision highp float;

uniform sampler2D uState;
uniform vec2 uBlockSize;

varying vec2 vUv;

void main() {
  float sumRate = 0.0;
  float sumRate2 = 0.0;
  float sumTension = 0.0;
  const int N = 3;
  const float NF = 3.0;

  for (int i = 0; i < N; i++) {
    for (int j = 0; j < N; j++) {
      vec2 offset = uBlockSize * (vec2(float(i), float(j)) / (NF - 1.0) - 0.5);
      vec4 s = texture2D(uState, vUv + offset);
      float rate = abs(s.g);
      sumRate += rate;
      sumRate2 += rate * rate;
      sumTension += abs(s.b);
    }
  }

  float count = NF * NF;
  float meanRate = sumRate / count;
  float varRate = sumRate2 / count - meanRate * meanRate;
  float meanTension = sumTension / count;

  gl_FragColor = vec4(meanRate, varRate, meanTension, 1.0);
}
`;
