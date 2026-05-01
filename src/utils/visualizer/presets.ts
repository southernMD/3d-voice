import * as THREE from 'three';

/**
 * 可视化预设接口
 */
export interface VisualizerPreset {
  name: string;
  init(scene: THREE.Scene, barCount: number, radius: number): void;
  update(dataArray: Uint8Array, fftSize: number): void;
  dispose(scene: THREE.Scene): void;
}

/**
 * 预设一：赛博环绕 (128频段平铺一整圈)
 */
export class TunnelPreset implements VisualizerPreset {
  public name = '赛博环绕';
  private barsUpper: THREE.Mesh[] = [];
  private barsLower: THREE.Mesh[] = [];
  private barCount = 128;

  public init(scene: THREE.Scene, barCount: number, radius: number) {
    this.barCount = barCount;
    const geometry = new THREE.BoxGeometry(0.15, 1, 0.15);

    for (let i = 0; i < this.barCount; i++) {
      const angle = (i / this.barCount) * Math.PI * 2;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;

      const color = new THREE.Color().setHSL(i / this.barCount, 0.8, 0.5);
      const material = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 1,
        metalness: 0.8,
        roughness: 0.2
      });

      const barUpper = new THREE.Mesh(geometry, material);
      barUpper.position.set(x, 0, z);
      barUpper.lookAt(0, 0, 0);
      scene.add(barUpper);
      this.barsUpper.push(barUpper);

      const barLower = new THREE.Mesh(geometry, material);
      barLower.position.set(x, 0, z);
      barLower.lookAt(0, 0, 0);
      scene.add(barLower);
      this.barsLower.push(barLower);
    }
  }

  public update(dataArray: Uint8Array, fftSize: number) {
    for (let i = 0; i < this.barCount; i++) {
      const index = Math.floor(Math.pow(i / this.barCount, 1.1) * fftSize * 0.65);
      const value = dataArray[index] || 0;
      const scale = 0.1 + (value / 255) * 12;

      if (this.barsUpper[i]) {
        this.barsUpper[i]!.scale.y = THREE.MathUtils.lerp(this.barsUpper[i]!.scale.y, scale, 0.2);
        this.barsUpper[i]!.position.y = this.barsUpper[i]!.scale.y / 2;
        this.barsLower[i]!.scale.y = this.barsUpper[i]!.scale.y;
        this.barsLower[i]!.position.y = -this.barsLower[i]!.scale.y / 2;

        const emissiveIntensity = 0.5 + (value / 255) * 4;
        (this.barsUpper[i]!.material as THREE.MeshStandardMaterial).emissiveIntensity = emissiveIntensity;
        (this.barsLower[i]!.material as THREE.MeshStandardMaterial).emissiveIntensity = emissiveIntensity;
      }
    }
  }

  public dispose(scene: THREE.Scene) {
    [...this.barsUpper, ...this.barsLower].forEach(mesh => {
      scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    });
    this.barsUpper = [];
    this.barsLower = [];
  }
}

/**
 * 预设二：对称合围 (左右各半圈对称)
 */
export class SymmetricTunnelPreset implements VisualizerPreset {
  public name = '对称合围';
  private barsUpper: THREE.Mesh[] = [];
  private barsLower: THREE.Mesh[] = [];
  private barCount = 128;

  public init(scene: THREE.Scene, barCount: number, radius: number) {
    this.barCount = barCount;
    const geometry = new THREE.BoxGeometry(0.15, 1, 0.15);
    const half = this.barCount / 2;

    for (let i = 0; i < this.barCount; i++) {
      let angle;
      const localIdx = i % half;
      const ratio = localIdx / half;

      // 核心对称逻辑：低频在同一起点，分别向两边合围
      if (i < half) {
        angle = ratio * Math.PI; // 0 -> PI
      } else {
        angle = -ratio * Math.PI; // 0 -> -PI
      }

      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;

      const color = new THREE.Color().setHSL(ratio, 0.8, 0.5);
      const material = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 1,
        metalness: 0.8,
        roughness: 0.2
      });

      const barUpper = new THREE.Mesh(geometry, material);
      barUpper.position.set(x, 0, z);
      barUpper.lookAt(0, 0, 0);
      scene.add(barUpper);
      this.barsUpper.push(barUpper);

      const barLower = new THREE.Mesh(geometry, material);
      barLower.position.set(x, 0, z);
      barLower.lookAt(0, 0, 0);
      scene.add(barLower);
      this.barsLower.push(barLower);
    }
  }

  public update(dataArray: Uint8Array, fftSize: number) {
    const half = this.barCount / 2;
    for (let i = 0; i < half; i++) {
      // 采样时也保持对称
      const index = Math.floor(Math.pow(i / half, 1.1) * fftSize * 0.65);
      const value = dataArray[index] || 0;
      const scale = 0.1 + (value / 255) * 12;

      // 同时更新左半边和右半边
      this.updatePair(i, scale, value);
      this.updatePair(i + half, scale, value);
    }
  }

  private updatePair(idx: number, scale: number, value: number) {
    if (this.barsUpper[idx]) {
      this.barsUpper[idx]!.scale.y = THREE.MathUtils.lerp(this.barsUpper[idx]!.scale.y, scale, 0.2);
      this.barsUpper[idx]!.position.y = this.barsUpper[idx]!.scale.y / 2;
      this.barsLower[idx]!.scale.y = this.barsUpper[idx]!.scale.y;
      this.barsLower[idx]!.position.y = -this.barsLower[idx]!.scale.y / 2;

      const emissiveIntensity = 0.5 + (value / 255) * 4;
      (this.barsUpper[idx]!.material as THREE.MeshStandardMaterial).emissiveIntensity = emissiveIntensity;
      (this.barsLower[idx]!.material as THREE.MeshStandardMaterial).emissiveIntensity = emissiveIntensity;
    }
  }

  public dispose(scene: THREE.Scene) {
    [...this.barsUpper, ...this.barsLower].forEach(mesh => {
      scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    });
    this.barsUpper = [];
    this.barsLower = [];
  }
}
