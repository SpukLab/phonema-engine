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
 * por segundo, no cada frame.
 *
 * Instrumentación (agregada tras el experimento A/B inconcluso): expone
 * tanto el valor suavizado (heterogeneity, lo que consumen cámara/luz)
 * como el crudo (rawHeterogeneity) y su derivada (dHdt) — sin esto no
 * se puede distinguir si el problema es la ganancia (H1), el timing
 * (H2: el sensor reacciona después de que ya pasó lo interesante), o la
 * variable en sí (H3: quizás lo que predice atención no es heterogeneidad
 * sino su velocidad de cambio, o alguna otra cosa).
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

  private lastRawHeterogeneity = 0;
  private lastReadbackTime = 0;

  heterogeneity = 0; // suavizado (EMA) — lo que consumen cámara y luz
  rawHeterogeneity = 0; // crudo, del último readback, sin suavizar
  dHdt = 0; // derivada de rawHeterogeneity respecto al tiempo simulado
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

  /** @param elapsedTotal tiempo simulado total (segundos) — necesario para fechar cada readback y poder calcular dH/dt real, no solo diferencias entre frames. */
  updateFromState(stateTexture: THREE.Texture, elapsedTotal: number): void {
    this.material.uniforms.uState.value = stateTexture;
    this.renderer.setRenderTarget(this.target);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);

    this.framesSinceRead++;
    if (this.framesSinceRead >= this.readInterval) {
      this.framesSinceRead = 0;
      this.readback(elapsedTotal);
    }
  }

  /** Frames transcurridos desde el último readback real a CPU — mide directamente cuán "atrasada" puede estar la señal respecto al frame actual. */
  get framesSinceLastReadback(): number {
    return this.framesSinceRead;
  }

  private readback(elapsedTotal: number): void {
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

    const dt = elapsedTotal - this.lastReadbackTime;
    this.dHdt = dt > 0 ? (targetHeterogeneity - this.lastRawHeterogeneity) / dt : 0;
    this.rawHeterogeneity = targetHeterogeneity;
    this.lastRawHeterogeneity = targetHeterogeneity;
    this.lastReadbackTime = elapsedTotal;

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

