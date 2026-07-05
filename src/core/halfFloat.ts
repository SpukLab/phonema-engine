/**
 * Decodifica un half-float (IEEE 754 binary16) almacenado como uint16
 * a un número JS normal. WebGL exige leer un render target HalfFloatType
 * con un Uint16Array — pedir un Float32Array produce un WARNING silencioso
 * (no una excepción) y el buffer queda en ceros sin que nada lo señale.
 */
export function halfToFloat(h: number): number {
  const sign = (h & 0x8000) >> 15;
  const exponent = (h & 0x7c00) >> 10;
  const fraction = h & 0x03ff;

  if (exponent === 0) {
    return (sign ? -1 : 1) * Math.pow(2, -14) * (fraction / 1024);
  } else if (exponent === 0x1f) {
    return fraction ? NaN : sign ? -Infinity : Infinity;
  }
  return (sign ? -1 : 1) * Math.pow(2, exponent - 15) * (1 + fraction / 1024);
}
