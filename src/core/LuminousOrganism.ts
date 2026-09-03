import * as THREE from "three";
import { LUMINOUS_VERTEX, LUMINOUS_FRAGMENT } from "../shaders/luminous";

function hash01(index: number, salt: number): number {
  const x = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453123;
  return x - Math.floor(x);
}

function fibonacciSphere(index: number, count: number): THREE.Vector3 {
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const y = 1 - (index / Math.max(1, count - 1)) * 2;
  const radius = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = goldenAngle * index;
  return new THREE.Vector3(
    Math.cos(theta) * radius,
    y,
    Math.sin(theta) * radius
  );
}

export class LuminousOrganism {
  readonly mesh: THREE.Points;
  private material: THREE.ShaderMaterial;

  constructor(stateTexture: THREE.Texture, count = 6200) {
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    const phases = new Float32Array(count);
    const sizes = new Float32Array(count);
    const tangents = new Float32Array(count * 3);

    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3(1, 0, 0);

    for (let i = 0; i < count; i += 1) {
      const n = fibonacciSphere(i, count);
      const radialBias = 0.90 + (hash01(i, 2) - 0.5) * 0.16;
      positions[i * 3] = n.x * radialBias;
      positions[i * 3 + 1] = n.y * radialBias;
      positions[i * 3 + 2] = n.z * radialBias;

      seeds[i] = hash01(i, 3);
      phases[i] = hash01(i, 5) * Math.PI * 2;
      sizes[i] = 4.0 + hash01(i, 7) * 7.5;

      const axis = Math.abs(n.dot(up)) > 0.92 ? right : up;
      const tangent = new THREE.Vector3().crossVectors(n, axis).normalize();
      const tangent2 = new THREE.Vector3().crossVectors(n, tangent).normalize();
      const angle = hash01(i, 11) * Math.PI * 2;
      tangent.multiplyScalar(Math.cos(angle)).addScaledVector(tangent2, Math.sin(angle)).normalize();

      tangents[i * 3] = tangent.x;
      tangents[i * 3 + 1] = tangent.y;
      tangents[i * 3 + 2] = tangent.z;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
    geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
    geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute("aTangent", new THREE.BufferAttribute(tangents, 3));

    this.material = new THREE.ShaderMaterial({
      vertexShader: LUMINOUS_VERTEX,
      fragmentShader: LUMINOUS_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uState: { value: stateTexture },
        uTime: { value: 0 },
        uPointScale: { value: 22.0 },
        uExpansion: { value: 1.0 },
        uDrift: { value: 1.0 },
        // Restrained luminous palette: cold sleeping units, warm energetic
        // release, pale cores. Saturation is present but not RGB/VJ-like.
        uColdColor: { value: new THREE.Color(0x6f89a4) },
        uWarmColor: { value: new THREE.Color(0xe6a35f) },
        uCoreColor: { value: new THREE.Color(0xffeee0) },
        uOpacity: { value: 0.82 }
      }
    });

    this.mesh = new THREE.Points(geometry, this.material);
    this.mesh.frustumCulled = false;
  }

  update(
    stateTexture: THREE.Texture,
    elapsed: number,
    _peakDirection?: THREE.Vector3,
    heterogeneity = 0
  ): void {
    this.material.uniforms.uState.value = stateTexture;
    this.material.uniforms.uTime.value = elapsed;

    // Observation can reveal a little more spatial breadth during high
    // heterogeneity, but never command a visual event.
    this.material.uniforms.uExpansion.value = THREE.MathUtils.lerp(0.92, 1.18, heterogeneity);
    this.material.uniforms.uDrift.value = THREE.MathUtils.lerp(0.78, 1.22, heterogeneity);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
