import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/**
 * 视觉渲染类：赛博朋克风对称频谱隧道
 */
export class Visualizer {
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private controls!: OrbitControls;
  
  private barsUpper: THREE.Mesh[] = [];
  private barsLower: THREE.Mesh[] = [];
  private particles!: THREE.Points;
  private centerLight!: THREE.PointLight;
  
  private readonly BAR_COUNT = 128; 
  private readonly RADIUS = 8;

  public init(container: HTMLElement) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x020205);
    this.scene.fog = new THREE.FogExp2(0x020205, 0.04);

    this.camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 1000);
    this.camera.position.set(0, 15, 25);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.3;
    this.controls.maxPolarAngle = Math.PI * 0.7;

    this.initPillars();
    this.initParticles();
    this.initEnvironment();
  }

  private initPillars() {
    // 使用更细长的长方体，营造“光柱”感
    const geometry = new THREE.BoxGeometry(0.15, 1, 0.15);
    
    for (let i = 0; i < this.BAR_COUNT; i++) {
      const angle = (i / this.BAR_COUNT) * Math.PI * 2;
      const x = Math.cos(angle) * this.RADIUS;
      const z = Math.sin(angle) * this.RADIUS;

      const color = new THREE.Color().setHSL(i / this.BAR_COUNT, 0.8, 0.5);
      const material = new THREE.MeshStandardMaterial({ 
        color,
        emissive: color,
        emissiveIntensity: 1,
        metalness: 0.8,
        roughness: 0.2
      });

      // 上半部分
      const barUpper = new THREE.Mesh(geometry, material);
      barUpper.position.set(x, 0, z);
      this.scene.add(barUpper);
      this.barsUpper.push(barUpper);

      // 下半部分 (镜像)
      const barLower = new THREE.Mesh(geometry, material);
      barLower.position.set(x, 0, z);
      this.scene.add(barLower);
      this.barsLower.push(barLower);
    }
  }

  private initParticles() {
    const count = 1500;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 60;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 40;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 60;
    }
    
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      size: 0.08,
      color: 0x00ffff,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending
    });
    
    this.particles = new THREE.Points(geometry, material);
    this.scene.add(this.particles);
  }

  private initEnvironment() {
    this.centerLight = new THREE.PointLight(0x00ffff, 0, 50);
    this.scene.add(this.centerLight);

    const ambient = new THREE.AmbientLight(0xffffff, 0.2);
    this.scene.add(ambient);
  }

  public update(dataArray: Uint8Array | null) {
    if (dataArray) {
      const fftSize = dataArray.length;
      let energy = 0;

      for (let i = 0; i < this.BAR_COUNT; i++) {
        // 使用非线性映射让频谱分布更广
        const index = Math.floor(Math.pow(i / this.BAR_COUNT, 1.3) * fftSize * 0.7);
        const value = dataArray[index] || 0;
        energy += value;

        // 计算高度：向上和向下伸展
        const scale = 0.1 + (value / 255) * 12;
        
        // 更新上半部分
        this.barsUpper[i].scale.y = THREE.MathUtils.lerp(this.barsUpper[i].scale.y, scale, 0.2);
        this.barsUpper[i].position.y = this.barsUpper[i].scale.y / 2;

        // 更新下半部分 (镜像)
        this.barsLower[i].scale.y = this.barsUpper[i].scale.y;
        this.barsLower[i].position.y = -this.barsLower[i].scale.y / 2;

        // 动态亮度
        (this.barsUpper[i].material as THREE.MeshStandardMaterial).emissiveIntensity = 0.5 + (value / 255) * 4;
      }

      const pulse = (energy / (this.BAR_COUNT * 255));
      this.centerLight.intensity = pulse * 100;
      this.centerLight.color.setHSL(0.5 + pulse * 0.2, 1, 0.5);
      
      this.particles.rotation.y += 0.002 + pulse * 0.02;
      this.particles.position.y = Math.sin(Date.now() * 0.001) * 2;
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  public resize(width: number, height: number) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  public dispose() {
    this.controls.dispose();
    this.renderer.dispose();
    this.scene.clear();
  }
}
