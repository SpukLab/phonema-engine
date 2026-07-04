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
        uDisplacementScale: { value: 0.16 },
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
        // Microscopic optical response: per-pixel roughness variation
        // driving a genuine specular term, one octave finer than meso.
        uMicroScale: { value: 55.0 },
        uRoughnessBase: { value: 0.5 },
        uRoughnessVariation: { value: 0.45 },
        uSpecularStrength: { value: 0.5 },
        // Subsurface translucency — reads as thickness, not a shell.
        uSubsurfaceColor: { value: new THREE.Color(0x3a2418) },
        uSubsurfaceStrength: { value: 0.25 },
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

  update(stateTexture: THREE.Texture, elapsed: number): void {
    this.material.uniforms.uState.value = stateTexture;
    this.material.uniforms.uTime.value = elapsed;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
