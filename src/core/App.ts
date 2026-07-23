import * as THREE from "three";
import { Simulation } from "./Simulation";
import { Organism } from "./Organism";
import { RevelationSensor } from "./RevelationSensor";

export class App {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private simulation: Simulation;
  private organism: Organism;
  private sensor: RevelationSensor;

  private clock: THREE.Clock;
  private container: HTMLElement;
  private elapsedTotal = 0;

  private static readonly CAMERA_BASE_Z = 3.6;
  private revelationEnabled: boolean;

  // Telemetría del último advance() — expuesta en getEvaluationSnapshot()
  // para poder distinguir, con datos, si el problema es la ganancia del
  // sensor, el timing, o la variable observada (ver discusión Sprint 05b).
  private lastCameraTarget = new THREE.Vector3();
  private lastRevealZoom = 0;
  private lastRevealPush = 0;

  constructor(container: HTMLElement, config: { revelationEnabled?: boolean } = {}) {
    this.container = container;
    this.revelationEnabled = config.revelationEnabled ?? true;

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
      // Necesario para que Evaluation Mode pueda releer el canvas vía
      // drawImage() después de renderizar. Sin esto, WebGL limpia el
      // buffer tras componer el frame, y cualquier lectura posterior
      // (aunque sea en el mismo tick) da negro/cero — exactamente el
      // bug que dejaba pixelMetrics en cero mientras simulationStats
      // (que lee la GPU directamente, no el canvas) ya funcionaba.
      preserveDrawingBuffer: true
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

    // El sensor observa; nunca escribe a uDiffusion/uReactionStrength/etc.
    // Solo cámara y luz lo consumen (ver advance() y Organism.update()).
    this.sensor = new RevelationSensor(this.renderer);

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
    this.sensor.updateFromState(this.simulation.stateTexture, this.elapsedTotal);

    // Dirección aproximada (no exacta) hacia el punto de mayor tensión
    // detectado por el sensor, a partir de su UV en la textura de estado.
    // La convención de UV del icosaedro de three.js es aproximadamente
    // equirectangular — esto es una inversión aproximada, suficiente
    // para una inclinación sutil, no para precisión geométrica.
    let peakDirection: THREE.Vector3 | undefined;
    let heterogeneity = 0;

    if (this.revelationEnabled) {
      const longitude = (this.sensor.peakUV.x - 0.5) * Math.PI * 2;
      const latitude = (0.5 - this.sensor.peakUV.y) * Math.PI;
      peakDirection = new THREE.Vector3(
        Math.cos(latitude) * Math.cos(longitude),
        Math.sin(latitude),
        Math.cos(latitude) * Math.sin(longitude)
      );
      heterogeneity = this.sensor.heterogeneity;
    }

    this.organism.update(this.simulation.stateTexture, this.elapsedTotal, peakDirection, heterogeneity);

    // Deriva autónoma extremadamente lenta — nunca espectacular. Las tres
    // frecuencias son deliberadamente no conmensurables entre sí (no hay
    // relación de números pequeños) para que, aun mirando varios minutos,
    // no se perciba un ciclo repetitivo. Períodos ~9-16 minutos: dentro
    // del primer minuto el movimiento debe sentirse casi quieto, no un pan.
    const driftX = Math.sin(this.elapsedTotal * 0.0091) * 0.16;
    const driftY = Math.cos(this.elapsedTotal * 0.0134) * 0.11;
    const dolly = Math.sin(this.elapsedTotal * 0.0053) * 0.18;

    // Inclinación del sensor: un acercamiento sutil (hasta ~4%) cuando la
    // heterogeneidad detectada sube — nunca reemplaza la deriva autónoma,
    // solo la modula. El factor de normalización (30) es una primera
    // aproximación sin calibrar contra el organismo corriendo en vivo;
    // necesita verse antes de confiar en el número. Con revelationEnabled
    // en false, heterogeneity queda en 0 y este término desaparece —
    // comportamiento idéntico al Sprint 04.
    const revealPush = THREE.MathUtils.clamp(heterogeneity * 30, 0, 1);
    const revealZoom = -0.04 * revealPush * App.CAMERA_BASE_Z;

    // cameraTarget = adonde iría la cámara sin el sensor (deriva pura);
    // cameraOffset/zoomApplied = lo que el sensor efectivamente movió.
    this.lastCameraTarget.set(driftX, driftY, App.CAMERA_BASE_Z + dolly);
    this.lastRevealZoom = revealZoom;
    this.lastRevealPush = revealPush;

    this.camera.position.x = driftX;
    this.camera.position.y = driftY;
    this.camera.position.z = App.CAMERA_BASE_Z + dolly + revealZoom;
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
        aspect: this.camera.aspect,
        cameraTarget: this.lastCameraTarget.toArray(),
        cameraOffset: this.lastRevealZoom,
        zoomApplied: this.lastRevealPush
      },
      sensor: {
        heterogeneity: this.sensor.heterogeneity,
        rawHeterogeneity: this.sensor.rawHeterogeneity,
        dHdt: this.sensor.dHdt,
        peakUV: this.sensor.peakUV.toArray(),
        sensorDelayFrames: this.sensor.framesSinceLastReadback
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
    this.sensor.dispose();
    this.renderer.dispose();
    this.container.removeChild(this.renderer.domElement);
  }
}
