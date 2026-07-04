import * as THREE from "three";
import { ORGANISM_VERTEX, ORGANISM_FRAGMENT } from "../shaders/organism";

export class Organism {
  readonly mesh: THREE.Mesh;
  private material: THREE.ShaderMaterial;

  constructor(stateTexture: THREE.Texture) {
    // detail=6 -> ~82k triangles: enough resolution for the field's
    // finite-difference normal reconstruction to read as continuous
    // surface, cheap enough for an average laptop GPU.
    const geometry = new THREE.IcosahedronGeometry(1, 6);

    this.material = new THREE.ShaderMaterial({
      vertexShader: ORGANISM_VERTEX,
      fragmentShader: ORGANISM_FRAGMENT,
      uniforms: {
        uState: { value: stateTexture },
        // Ligero aumento sobre el valor anterior (0.16) — más relieve
        // macro perceptible, parte del pedido de "más denso y profundo".
        uDisplacementScale: { value: 0.19 },
        // Desgaste (S) siempre resta — colapsa hacia adentro. Es lo que
        // rompe la silueta esférica con comportamiento acumulado, no
        // con una capa de ruido más.
        uAgeDisplacementScale: { value: 0.30 },
        // Fixed spatial warp — shared scale between vertex/fragment,
        // independent strengths and seeds per use so displacement,
        // color, and activity never trace the same boundary curve.
        uWarpScale: { value: 4.0 },
        uWarpStrength: { value: 0.015 },
        uColorWarpStrength: { value: 0.05 },
        uActivityWarpStrength: { value: 0.04 },
        uGrainScale: { value: 40.0 },
        uGrainStrength: { value: 0.06 },
        // Mesoscopic structure: fixed relief, one octave finer than the
        // domain-wall warp scale (4.0) — a real bump, not a hidden field.
        uMesoScale: { value: 14.0 },
        uMesoStrength: { value: 13.0 },
        // Oclusión ambiental falsa desde el mismo relieve meso — lo que
        // realmente vende profundidad de cerca, no solo la normal doblada.
        uAOStrength: { value: 0.45 },
        // Microscopic optical response: per-pixel roughness variation
        // driving a genuine specular term, one octave finer than meso.
        uMicroScale: { value: 55.0 },
        uRoughnessBase: { value: 0.5 },
        uRoughnessVariation: { value: 0.45 },
        uSpecularStrength: { value: 0.5 },
        // Cuánto la tensión interna (W) agita la rugosidad óptica y
        // refuerza el brillo subsuperficial — el material "responde"
        // ópticamente a su propio estado, sin dibujar la tensión como
        // una forma reconocible propia.
        uTensionRoughnessGain: { value: 0.8 },
        uTensionSubsurfaceGain: { value: 0.35 },
        // Subsurface translucency — reads as thickness, not a shell.
        uSubsurfaceColor: { value: new THREE.Color(0x3a2418) },
        uSubsurfaceStrength: { value: 0.08 },
        // Pátina: manchas fijas, muy baja frecuencia — óxido/liquen.
        uPatinaColor: { value: new THREE.Color(0x3e4433) },
        uPatinaStrength: { value: 0.35 },
        uKeyLightDir: { value: new THREE.Vector3(0.4, 0.6, 0.8).normalize() },
        uKeyLightColor: { value: new THREE.Color(0xd8d4cc) },
        uFillColor: { value: new THREE.Color(0x1a2230) },
        // Calibración visual: el contraste anterior (casi negro vs. gris
        // claro) ahogaba meso/micro bajo el swing tonal del macro. Rango
        // más angosto deja que las otras dos escalas compitan visualmente.
        uBaseColorLow: { value: new THREE.Color(0x141210) },
        uBaseColorHigh: { value: new THREE.Color(0x9e9486) },
        uTime: { value: 0 }
      }
    });

    this.mesh = new THREE.Mesh(geometry, this.material);
  }

  private static readonly BASE_LIGHT_DIR = new THREE.Vector3(0.4, 0.6, 0.8).normalize();

  update(stateTexture: THREE.Texture, elapsed: number): void {
    this.material.uniforms.uState.value = stateTexture;
    this.material.uniforms.uTime.value = elapsed;

    // Deriva lenta de la luz clave: no es un Director, es la misma
    // autonomía fija que ya tiene la cámara, aplicada a la luz. Períodos
    // largos (~130-170s) para que dentro del primer minuto el rasante
    // cambie lo suficiente como para revelar meso/micro desde ángulos
    // distintos, sin que se note como una animación de luz.
    const dir = Organism.BASE_LIGHT_DIR.clone();
    dir.x += Math.sin(elapsed * (2 * Math.PI / 137)) * 0.22;
    dir.y += Math.cos(elapsed * (2 * Math.PI / 163)) * 0.14;
    dir.normalize();
    (this.material.uniforms.uKeyLightDir.value as THREE.Vector3).copy(dir);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
