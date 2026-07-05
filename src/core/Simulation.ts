import * as THREE from "three";
import {
  SIMULATION_VERTEX,
  SIMULATION_FRAGMENT,
  SIMULATION_INIT_FRAGMENT
} from "../shaders/simulation";

export interface SimulationParams {
  /** Domain-wall width ~ sqrt(diffusion / reactionStrength). Small values
   *  (relative to reactionStrength) produce many thin, slowly-coarsening
   *  domains rather than one wide blob. */
  diffusion: number;
  /** Strength of the bistable self-interaction. This is the primary
   *  driver of motion — it works with thermalNoise at 0. */
  reactionStrength: number;
  /** Small thermal perturbation. Should be an order of magnitude below
   *  reactionStrength; its removal should change texture, not behavior. */
  thermalNoise: number;
  /** Timescale of the recovery variable W relative to V. Small = W moves
   *  much slower than V, which is what separates "tension building" from
   *  "release" into two visibly different paces. */
  epsilon: number;
  /** Target ratio W settles toward relative to V at quasi-equilibrium. */
  gamma: number;
  /** How strongly accumulated W suppresses V's reaction. This is the
   *  actual coupling that turns pure bistability into an excitable,
   *  cyclical regime. Verified numerically (tools/fhn_check.py) before
   *  being set here — values were not guessed. */
  wCoupling: number;
  /** Growth rate of S (accumulated wear/age) per unit of tension
   *  experienced. A ratchet, not an oscillator — it only ever grows
   *  meaningfully, matching "scar," not "cycle." */
  ageGain: number;
  /** Decay rate of S. Should be tiny relative to ageGain — history
   *  should persist far longer than it took to accumulate. */
  ageDecay: number;
}

/**
 * Owns the organism's internal scalar field.
 * This is the only source of truth for internal state — rendering
 * reads from here and never fabricates values of its own.
 */
export class Simulation {
  readonly resolution: number;

  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private quad: THREE.Mesh;
  private material: THREE.ShaderMaterial;

  private targetA: THREE.WebGLRenderTarget;
  private targetB: THREE.WebGLRenderTarget;
  private readTarget: THREE.WebGLRenderTarget;
  private writeTarget: THREE.WebGLRenderTarget;

  private elapsed = 0;

  // Producing domain walls wide enough to read as shapes (rather than
  // single-pixel salt-and-pepper) requires a diffusion coefficient too
  // large for one explicit-Euler step per frame to stay stable. Substepping
  // lets the field integrate accurately without raising the frame rate
  // or shrinking the pattern scale. Pure loop, no new subsystem.
  //
  // No es una const fija: Evaluation Mode la reduce temporalmente para
  // no pagar 172.800 draw calls bajo software rendering. El margen de
  // estabilidad a diffusion=40 sigue siendo amplio incluso en 6 (ver
  // App.advanceDeterministic).
  private substeps = 16;

  constructor(
    renderer: THREE.WebGLRenderer,
    resolution: number,
    params: SimulationParams
  ) {
    this.renderer = renderer;
    this.resolution = resolution;

    const rtOptions: THREE.RenderTargetOptions = {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.RepeatWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      depthBuffer: false,
      stencilBuffer: false
    };

    this.targetA = new THREE.WebGLRenderTarget(resolution, resolution, rtOptions);
    this.targetB = new THREE.WebGLRenderTarget(resolution, resolution, rtOptions);
    this.readTarget = this.targetA;
    this.writeTarget = this.targetB;

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.material = new THREE.ShaderMaterial({
      vertexShader: SIMULATION_VERTEX,
      fragmentShader: SIMULATION_FRAGMENT,
      uniforms: {
        uPrevState: { value: null },
        uResolution: { value: new THREE.Vector2(resolution, resolution) },
        uTime: { value: 0 },
        uDeltaTime: { value: 0 },
        uDiffusion: { value: params.diffusion },
        uReactionStrength: { value: params.reactionStrength },
        uThermalNoise: { value: params.thermalNoise },
        uEpsilon: { value: params.epsilon },
        uGamma: { value: params.gamma },
        uWCoupling: { value: params.wCoupling },
        uAgeGain: { value: params.ageGain },
        uAgeDecay: { value: params.ageDecay }
      },
      depthTest: false,
      depthWrite: false
    });

    const geometry = new THREE.PlaneGeometry(2, 2);
    this.quad = new THREE.Mesh(geometry, this.material);
    this.scene.add(this.quad);

    this.seed();
  }

  private seed(): void {
    const initMaterial = new THREE.ShaderMaterial({
      vertexShader: SIMULATION_VERTEX,
      fragmentShader: SIMULATION_INIT_FRAGMENT,
      uniforms: {
        uResolution: { value: new THREE.Vector2(this.resolution, this.resolution) }
      },
      depthTest: false,
      depthWrite: false
    });

    this.quad.material = initMaterial;
    this.renderer.setRenderTarget(this.readTarget);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(this.writeTarget);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);

    initMaterial.dispose();
    this.quad.material = this.material;
  }

  step(deltaTime: number): void {
    const subDt = deltaTime / this.substeps;

    for (let i = 0; i < this.substeps; i++) {
      this.elapsed += subDt;

      this.material.uniforms.uPrevState.value = this.readTarget.texture;
      this.material.uniforms.uTime.value = this.elapsed;
      this.material.uniforms.uDeltaTime.value = subDt;

      this.renderer.setRenderTarget(this.writeTarget);
      this.renderer.render(this.scene, this.camera);
      this.renderer.setRenderTarget(null);

      const tmp = this.readTarget;
      this.readTarget = this.writeTarget;
      this.writeTarget = tmp;
    }
  }

  setSubsteps(n: number): void {
    this.substeps = n;
  }

  get stateTexture(): THREE.Texture {
    return this.readTarget.texture;
  }

  /**
   * Decodifica un half-float (IEEE 754 binary16) almacenado como uint16
   * a un número JS normal. Necesario porque WebGL exige leer un render
   * target HalfFloatType con un Uint16Array — pedir un Float32Array
   * (lo que hacía antes) produce un WARNING silencioso de WebGL, no una
   * excepción, y el buffer queda en ceros sin que nada lo señale.
   */
  private static halfToFloat(h: number): number {
    const sign = (h & 0x8000) >> 15;
    const exponent = (h & 0x7c00) >> 10;
    const fraction = h & 0x03ff;

    if (exponent === 0) {
      return (sign ? -1 : 1) * Math.pow(2, -14) * (fraction / 1024);
    } else if (exponent === 0x1f) {
      return fraction ? NaN : (sign ? -Infinity : Infinity);
    }
    return (sign ? -1 : 1) * Math.pow(2, exponent - 15) * (1 + fraction / 1024);
  }

  /**
   * Lee el estado real desde la GPU (no una aproximación) y devuelve
   * estadísticas del campo. Usado por Evaluation Mode para review.json.
   * Costoso (readback síncrono) — solo se llama en modo evaluación,
   * nunca en el loop de render normal.
   */
  readStats(): {
    meanAbsV: number;
    varianceV: number;
    meanAbsW: number;
    meanAge: number;
    maxDisplacementProxy: number;
  } {
    const n = this.resolution * this.resolution;
    const pixels = new Uint16Array(n * 4);
    this.renderer.readRenderTargetPixels(
      this.readTarget,
      0,
      0,
      this.resolution,
      this.resolution,
      pixels
    );

    let sumAbsV = 0;
    let sumV = 0;
    let sumV2 = 0;
    let sumAbsW = 0;
    let sumAge = 0;
    let maxAbsV = 0;

    for (let i = 0; i < n; i++) {
      const v = Simulation.halfToFloat(pixels[i * 4 + 0]);
      const w = Simulation.halfToFloat(pixels[i * 4 + 2]);
      const s = Simulation.halfToFloat(pixels[i * 4 + 3]);
      sumAbsV += Math.abs(v);
      sumV += v;
      sumV2 += v * v;
      sumAbsW += Math.abs(w);
      sumAge += s;
      if (Math.abs(v) > maxAbsV) maxAbsV = Math.abs(v);
    }

    const meanV = sumV / n;
    const varianceV = sumV2 / n - meanV * meanV;

    return {
      meanAbsV: sumAbsV / n,
      varianceV,
      meanAbsW: sumAbsW / n,
      meanAge: sumAge / n,
      maxDisplacementProxy: maxAbsV
    };
  }

  dispose(): void {
    this.targetA.dispose();
    this.targetB.dispose();
    this.material.dispose();
    this.quad.geometry.dispose();
  }
}
