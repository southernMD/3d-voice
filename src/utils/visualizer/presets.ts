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

      if (i < half) {
        angle = ratio * Math.PI;
      } else {
        angle = -ratio * Math.PI;
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
      const index = Math.floor(Math.pow(i / half, 1.1) * fftSize * 0.65);
      const value = dataArray[index] || 0;
      const scale = 0.1 + (value / 255) * 12;
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

/**
 * 预设三：星际原核 (着色器动态核心方案)
 */
export class SpherePreset implements VisualizerPreset {
  public name = '星际原核';
  private bars: THREE.Mesh[] = [];
  private coreGroup: THREE.Group | null = null;
  private coreMain: THREE.Mesh | null = null;
  private coreWire: THREE.Mesh | null = null;
  private barCount = 400;
  private audioTexture: THREE.DataTexture | null = null;
  private shaderUniforms: any = null;

  public init(scene: THREE.Scene, _barCount: number, radius: number) {
    this.coreGroup = new THREE.Group();
    scene.add(this.coreGroup);

    const data = new Uint8Array(256);
    this.audioTexture = new THREE.DataTexture(data, 256, 1, THREE.RedFormat);
    this.audioTexture.needsUpdate = true;

    this.shaderUniforms = {
      uAudioData: { value: this.audioTexture }
    };

    const coreGeom = new THREE.IcosahedronGeometry(radius * 0.7, 5);
    const coreMat = new THREE.ShaderMaterial({
      uniforms: this.shaderUniforms,
      transparent: true,
      vertexShader: `
        varying vec3 vPosition;
        varying float vAudioValue;
        uniform sampler2D uAudioData;
        
        void main() {
          vPosition = position;
          vec3 dir = normalize(position);
          
          // 修正：使用 acos 反推角度，确保与光柱的 phi 逻辑一致
          float phi = acos(dir.y); // 0 (顶) 到 PI (底)
          float t = 1.0 - (phi / 3.14159265); // 0 (底) 到 1 (顶)
          
          // 修正：使用相同的指数采样逻辑 (pow 1.1)
          float sampleIdx = pow(t, 1.1);
          vAudioValue = texture2D(uAudioData, vec2(sampleIdx * 0.7, 0.5)).r;
          
          // 菲涅尔/边缘发光计算
          vec3 viewDir = normalize(cameraPosition - vPosition);
          float rim = 1.0 - max(dot(viewDir, dir), 0.0);
          rim = pow(rim, 3.0);
          
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          vAudioValue = vAudioValue + rim * 0.5; // 将边缘光注入 vAudioValue 传递给片元
        }
      `,
      fragmentShader: `
        varying vec3 vPosition;
        varying float vAudioValue;
        
        vec3 hsl2rgb(vec3 c) {
          vec3 rgb = clamp(abs(mod(c.x*6.0+vec3(0.0,4.0,2.0),6.0)-3.0)-1.0, 0.0, 1.0);
          return c.z + c.y * (rgb-0.5)*(1.0-abs(2.0*c.z-1.0));
        }

        void main() {
          vec3 dir = normalize(vPosition);
          float phi = acos(dir.y);
          float t = 1.0 - (phi / 3.14159265);
          
          // 局部色彩律动同步
          float finalHue = mod(t + vAudioValue * 0.1, 1.0);
          vec3 baseColor = hsl2rgb(vec3(finalHue, 0.9, 0.5));
          
          float brightness = 0.4 + vAudioValue * 2.8;
          gl_FragColor = vec4(baseColor * brightness, 0.9);
        }
      `
    });
    this.coreMain = new THREE.Mesh(coreGeom, coreMat);
    this.coreGroup.add(this.coreMain);

    const wireMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      wireframe: true,
      transparent: true,
      opacity: 0.1
    });
    this.coreWire = new THREE.Mesh(coreGeom, wireMat);
    this.coreWire.scale.multiplyScalar(1.02);
    this.coreGroup.add(this.coreWire);

    const geometry = new THREE.CylinderGeometry(0, 0.05, 1.0, 6); // 增加底座宽度，使其更明显
    geometry.translate(0, 0.5, 0);
    for (let i = 0; i < this.barCount; i++) {
      const phi = Math.acos(-1 + (2 * i) / this.barCount);
      const theta = Math.sqrt(this.barCount * Math.PI) * phi;
      const startRadius = radius * 0.6;

      const x = startRadius * Math.sin(phi) * Math.cos(theta);
      const y = startRadius * Math.cos(phi);
      const z = startRadius * Math.sin(phi) * Math.sin(theta);

      const t = (y / startRadius + 1.0) / 2.0;
      const color = new THREE.Color().setHSL(t, 0.9, 0.5);

      const material = new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: color },
          uIntensity: { value: 10.0 }, // 初始亮度大幅提升
          uOpacity: { value: 1.0 }    // 基础不透明度提升
        },
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        vertexShader: `
          varying float vY;
          void main() {
            vY = position.y + 0.5; // 获取局部高度 (0到1)
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 uColor;
          uniform float uIntensity;
          uniform float uOpacity;
          varying float vY;
          void main() {
            // 降低消散速度，让光束主体更明亮
            float fade = pow(1.0 - vY, 0.7); 
            gl_FragColor = vec4(uColor * uIntensity, fade * uOpacity);
          }
        `
      });
      const bar = new THREE.Mesh(geometry, material);
      bar.position.set(x, y, z);
      bar.lookAt(0, 0, 0);
      bar.rotateX(-Math.PI / 2); // 旋转使其朝向外部
      this.coreGroup.add(bar);
      this.bars.push(bar);
    }
  }

  public update(dataArray: Uint8Array, fftSize: number) {
    if (this.coreGroup) {
      // 旋转逻辑移至顶部，确保即使没有音频或处理延迟，场景也会立即开始旋转
      this.coreGroup.rotation.y += 0.01; // 稍微提升一点速度
      this.coreGroup.rotation.x += 0.006;
    }

    if (this.audioTexture) {
      this.audioTexture.image.data!.set(dataArray.slice(0, 256));
      this.audioTexture.needsUpdate = true;
    }

    const halfSize = Math.floor(fftSize * 0.7);
    for (let i = 0; i < this.barCount; i++) {
      const phi = Math.acos(-1 + (2 * i) / this.barCount);
      const y = Math.cos(phi);
      const t = (y + 1.0) / 2.0;

      const index = Math.floor(Math.pow(t, 1.1) * halfSize);
      const value = dataArray[index] || 0;
      const scale = Math.max(3.5, 0.1 + (value / 255) * 20.0); // 设置基础长度为 3.5，确保无音频时也有射线

      if (this.bars[i]) {
        this.bars[i]!.scale.y = THREE.MathUtils.lerp(this.bars[i]!.scale.y, scale, 0.15);
        const mat = this.bars[i]!.material as THREE.ShaderMaterial;

        const shiftHue = (t + (value / 255) * 0.1) % 1.0;
        const dynamicColor = new THREE.Color().setHSL(shiftHue, 1.0, 0.5);
        mat.uniforms.uColor.value.copy(dynamicColor);
        mat.uniforms.uIntensity.value = 5.0 + (value / 255) * 45.0; // 极大的亮度范围
      }
    }

    // 增加核心球体的抽动/脉动效果
    if (this.coreMain && this.coreWire) {
      // 取低频段的最大值作为脉动依据
      const lowFreqs = dataArray.slice(0, 128);
      const maxVal = Math.max(...lowFreqs);
      const pulseScale = 1.0 + (maxVal / 255) * 0.12; 
      
      const targetScale = new THREE.Vector3(pulseScale, pulseScale, pulseScale);
      this.coreMain.scale.lerp(targetScale, 0.2); 
      this.coreWire.scale.copy(this.coreMain.scale).multiplyScalar(1.02);
    }
  }

  public dispose(scene: THREE.Scene) {
    if (this.coreGroup) {
      scene.remove(this.coreGroup);
      this.bars.forEach(m => {
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      });
      if (this.coreMain) {
        this.coreMain.geometry.dispose();
        (this.coreMain.material as THREE.Material).dispose();
      }
      if (this.coreWire) {
        this.coreWire.geometry.dispose();
        (this.coreWire.material as THREE.Material).dispose();
      }
      if (this.audioTexture) {
        this.audioTexture.dispose();
      }
      this.coreGroup = null;
    }
    this.bars = [];
  }
}
