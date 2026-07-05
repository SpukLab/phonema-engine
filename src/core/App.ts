import * as THREE from "three";
import { Simulation } from "./Simulation";
import { Organism } from "./Organism";

export class App {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private simulation: Simulation;
  private organism: Organism;

  private clock: THREE.Clock;
  private container: HTMLElement;
  private elapsedTotal = 0;

  private static readonly CAMERA_BASE_Z = 3.6;

  constructor(container: HTMLElement) {
    this.container = container;

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance"
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x050505, 1);
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(
      24,
      window.innerWidth / window.innerHeight,
      0.1,
      100
    );
    this.camera.position.set(0, 0, 3.6);
    this.camera.lookAt(0, 0, 0);

    // Field resolution: 256 is enough for slow diffusion to read as
    // continuous at organism scale, and cheap to step every frame.
    // Calibración visual (no matemática): reaction=1.0 colapsaba a un
    // dominio casi único hacia los ~30s incluso con ruido bajo — se
    // sentía "congelado" antes de lo deseado. reaction=0.35 + thermal=0.05
    // sostiene variedad visible mucho más tiempo sin perder el requisito
    // de "sigue vivo con casi nada de ruido". diffusion=40 recalcula el
    // ancho de pared a ~0.042 en unidades UV (sqrt(diffusion*texel^2/reaction)).
    //
    // epsilon/gamma/wCoupling: acoplamiento tipo FitzHugh-Nagumo verificado
    // con tools/fhn_check.py (estadística temporal real, no estética) —
    // mean|V| sube y baja varias veces en 90s simulados en vez de decaer
    // monótonamente a una meseta. Esto es lo que produce quietud/tensión/
    // liberación/reorganización emergiendo de la física, no de un guion.
    // epsilon/gamma/wCoupling recalibrados para Sprint 04: el régimen
    // anterior (0.06/0.9/1.8) ciclaba cada ~20s — demasiado frecuente
    // para leerse como "evento", más como respiración continua. Este
    // régimen (verificado con tools/fhn_check.py sobre 240s simulados)
    // muestra liberaciones nítidas cada ~42-44s, con tramos largos de
    // meseta entre medio — más cerca de "quietud aparente, después algo
    // pasa" que de un ciclo corto y previsible.
    this.simulation = new Simulation(this.renderer, 256, {
      diffusion: 40,
      reactionStrength: 0.35,
      thermalNoise: 0.05,
      epsilon: 0.015,
      gamma: 0.85,
      wCoupling: 2.2,
      ageGain: 0.12,
      ageDecay: 0.002
    });

    this.organism = new Organism(this.simulation.stateTexture);
    this.scene.add(this.organism.mesh);

    this.clock = new THREE.Clock();

    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  private resize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  start(): void {
    this.renderer.setAnimationLoop(() => this.tick());
  }

  private advance(delta: number): void {
    this.elapsedTotal += delta;

    this.simulation.step(delta);
    this.organism.update(this.simulation.stateTexture, this.elapsedTotal);

    // Deriva autónoma extremadamente lenta — nunca espectacular. Las tres
    // frecuencias son deliberadamente no conmensurables entre sí (no hay
    // relación de números pequeños) para que, aun mirando varios minutos,
    // no se perciba un ciclo repetitivo. Períodos ~9-16 minutos: dentro
    // del primer minuto el movimiento debe sentirse casi quieto, no un pan.
    const driftX = Math.sin(this.elapsedTotal * 0.0091) * 0.16;
    const driftY = Math.cos(this.elapsedTotal * 0.0134) * 0.11;
    const dolly = Math.sin(this.elapsedTotal * 0.0053) * 0.18;

    this.camera.position.x = driftX;
    this.camera.position.y = driftY;
    this.camera.position.z = App.CAMERA_BASE_Z + dolly;
    this.camera.lookAt(0, 0, 0);
  }

  private tick(): void {
    const delta = Math.min(this.clock.getDelta(), 1 / 30);
    this.advance(delta);
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Evaluation Mode: avanza la simulación de forma determinística (dt fijo,
   * no ligado al reloj real) hasta `targetSeconds` de tiempo simulado, y
   * renderiza un frame final. Usado por tools/evaluate.mjs para producir
   * capturas reproducibles en t=0/30/60/180s sin depender de tiempo real
   * de pared ni de la cadencia de requestAnimationFrame.
   *
   * Reduce temporalmente los sub-pasos de difusión (16→6) durante el
   * avance: bajo software rendering (Chromium headless sin GPU), cada
   * sub-paso es una llamada de dibujo cara, y 172.800 de ellas para
   * llegar a t=180s tardaban ~20 minutos reales. A 6 sub-pasos el margen
   * de estabilidad para diffusion=40 sigue siendo ~2.25x — no es un
   * atajo que arriesgue la física, es evitar pagar precisión que la
   * inspección visual/estadística no necesita.
   */
  advanceDeterministic(targetSeconds: number, fixedDt = 1 / 60): void {
    this.simulation.setSubsteps(6);
    while (this.elapsedTotal < targetSeconds) {
      const step = Math.min(fixedDt, targetSeconds - this.elapsedTotal);
      this.advance(step);
    }
    this.simulation.setSubsteps(16);
    this.renderer.render(this.scene, this.camera);
  }

  getEvaluationSnapshot(): Record<string, unknown> {
    return {
      elapsedSeconds: this.elapsedTotal,
      camera: {
        fov: this.camera.fov,
        position: this.camera.position.toArray(),
        aspect: this.camera.aspect
      },
      simulationStats: this.simulation.readStats()
    };
  }

  get domElement(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null);
    this.simulation.dispose();
    this.organism.dispose();
    this.renderer.dispose();
    this.container.removeChild(this.renderer.domElement);
  }
}
