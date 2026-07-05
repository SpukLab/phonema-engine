import * as THREE from "three";
import { SENSOR_VERTEX, SENSOR_FRAGMENT } from "../shaders/sensor";
import { halfToFloat } from "./halfFloat";

/**
 * Implementa, de forma acotada, la sección "interacción con Cámara" y
 * "interacción con Iluminación" del documento congelado del Director
 * (docs/DIRECTOR_DESIGN.md) — sin modos, sin clima sobre la simulación,
 * sin tocar ningún parámetro físico. Regla de este sprint: antes de
 * tocar diffusion/reaction/thermalNoise, demostrar que el problema no
 * se resuelve con cámara, luz o puesta en escena. Esto es esa demostración.
 *
 * El sensor reduce el campo (256x256) a una grilla chica (16x16) en GPU
 * cada frame — barato — y solo hace un readback a CPU unas pocas veces
 * por segundo, no cada frame. Expone:
 *   - heterogeneity: cuánta variación espacial de actividad hay ahora
 *     mismo (proxy directo de si el campo se está sincronizando/
 *     aplanando, el hallazgo del Sprint 04).
 *   - peakUV: dónde está la tensión más alta ahora mismo.
 * Ambos suavizados (EMA) para que cualquier consumidor los use sin
 * introducir movimiento brusco.
 */
export class RevelationSensor {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private quad: THREE.Mesh;
  private material: THREE.ShaderMaterial;
  private target: THREE.WebGLRenderTarget;
  private gridSize: number;
  private readInterval: number;
  private framesSinceRead = 0;

  heterogeneity = 0;
  readonly peakUV = new THREE.Vector2(0.5, 0.5);

  constructor(renderer: THREE.WebGLRenderer, gridSize = 16, readInterval = 20) {
    this.renderer = renderer;
    this.gridSize = gridSize;
    this.readInterval = readInterval;

    this.target = new THREE.WebGLRenderTarget(gridSize, gridSize, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: false,
      stencilBuffer: false
    });

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.material = new THREE.ShaderMaterial({
      vertexShader: SENSOR_VERTEX,
      fragmentShader: SENSOR_FRAGMENT,
      uniforms: {
        uState: { value: null },
        uBlockSize: { value: new THREE.Vector2(1 / gridSize, 1 / gridSize) }
      },
      depthTest: false,
      depthWrite: false
    });

    const geometry = new THREE.PlaneGeometry(2, 2);
    this.quad = new THREE.Mesh(geometry, this.material);
    this.scene.add(this.quad);
  }

  updateFromState(stateTexture: THREE.Texture): void {
    this.material.uniforms.uState.value = stateTexture;
    this.renderer.setRenderTarget(this.target);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);

    this.framesSinceRead++;
    if (this.framesSinceRead >= this.readInterval) {
      this.framesSinceRead = 0;
      this.readback();
    }
  }

  private readback(): void {
    const n = this.gridSize * this.gridSize;
    const pixels = new Uint16Array(n * 4);
    this.renderer.readRenderTargetPixels(this.target, 0, 0, this.gridSize, this.gridSize, pixels);

    let sumRate = 0;
    let sumRate2 = 0;
    let maxTension = -Infinity;
    let peakIndex = 0;

    for (let i = 0; i < n; i++) {
      const rate = halfToFloat(pixels[i * 4 + 0]);
      const tension = halfToFloat(pixels[i * 4 + 2]);
      sumRate += rate;
      sumRate2 += rate * rate;
      if (tension > maxTension) {
        maxTension = tension;
        peakIndex = i;
      }
    }

    const meanRate = sumRate / n;
    const targetHeterogeneity = sumRate2 / n - meanRate * meanRate;

    // EMA: la señal nunca debe saltar de un readback al siguiente,
    // aunque el readback en sí sea instantáneo.
    this.heterogeneity += (targetHeterogeneity - this.heterogeneity) * 0.15;

    const px = peakIndex % this.gridSize;
    const py = Math.floor(peakIndex / this.gridSize);
    const targetPeak = new THREE.Vector2(
      (px + 0.5) / this.gridSize,
      (py + 0.5) / this.gridSize
    );
    this.peakUV.lerp(targetPeak, 0.15);
  }

  dispose(): void {
    this.target.dispose();
    this.material.dispose();
    this.quad.geometry.dispose();
  }
}
