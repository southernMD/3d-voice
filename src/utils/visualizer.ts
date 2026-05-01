import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { type VisualizerPreset, TunnelPreset } from './visualizer/presets';

/**
 * 核心渲染引擎：负责环境、控制、流星及预设管理
 */
export class Visualizer {
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private controls!: OrbitControls;

  // 环境组件
  private particles!: THREE.Points;
  private centerLight!: THREE.PointLight;
  private currentPreset: VisualizerPreset | null = null;

  // 流星系统
  private meteors: { mesh: THREE.Mesh; velocity: THREE.Vector3; life: number }[] = [];
  private readonly MAX_METEORS = 20;

  private readonly BAR_COUNT = 128;
  private readonly RADIUS = 8;
  private lastPulse = 0;

  public init(container: HTMLElement) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x020205);
    this.scene.fog = new THREE.FogExp2(0x020205, 0.015);

    this.camera = new THREE.PerspectiveCamera(
      60,
      container.clientWidth / container.clientHeight,
      0.1,
      1000
    );
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

    // 初始化公共环境
    this.initParticles();
    this.initEnvironment();

    // 默认加载赛博隧道预设
    this.setPreset(new TunnelPreset());
  }

  /**
   * 切换可视化预设
   */
  public setPreset(preset: VisualizerPreset) {
    if (this.currentPreset) {
      this.currentPreset.dispose(this.scene);
    }
    this.currentPreset = preset;
    this.currentPreset.init(this.scene, this.BAR_COUNT, this.RADIUS);
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
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.2));
  }

  private spawnMeteor(pulse: number) {
    if (this.meteors.length >= this.MAX_METEORS) return;
    const geometry = new THREE.CylinderGeometry(0, 0.02, 6, 4);
    const hue = (0.5 + pulse * 0.3) % 1.0;
    const color = new THREE.Color().setHSL(hue, 0.9, 0.6);
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending
    });
    const meteor = new THREE.Mesh(geometry, material);
    const x = (Math.random() - 0.5) * 80;
    const y = 25 + Math.random() * 15;
    const z = (Math.random() - 0.5) * 60;
    meteor.position.set(x, y, z);
    const speed = 0.5 + pulse * 1.5;
    const velocity = new THREE.Vector3((x > 0 ? -1 : 1) * (speed * 0.6), -speed * 0.4, (Math.random() - 0.5) * speed);
    meteor.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), velocity.clone().normalize());
    this.scene.add(meteor);
    this.meteors.push({ mesh: meteor, velocity, life: 1.0 });
  }

  private updateMeteors() {
    for (let i = this.meteors.length - 1; i >= 0; i--) {
      const m = this.meteors[i]!;
      m.mesh.position.add(m.velocity);
      m.life -= 0.012;
      if (m.mesh.material instanceof THREE.MeshBasicMaterial) {
        m.mesh.material.opacity = Math.max(0, m.life);
      }
      if (m.life <= 0 || m.mesh.position.y < -20) {
        this.scene.remove(m.mesh);
        m.mesh.geometry.dispose();
        if (m.mesh.material instanceof THREE.Material) m.mesh.material.dispose();
        this.meteors.splice(i, 1);
      }
    }
  }

  public update(dataArray: Uint8Array | null) {
    if (dataArray) {
      const fftSize = dataArray.length;

      // 更新当前预设
      if (this.currentPreset) {
        this.currentPreset.update(dataArray, fftSize);
      }

      const maxVal = Math.max(...Array.from(dataArray));
      const pulse = maxVal / 255;

      this.centerLight.intensity = pulse * 120;
      this.centerLight.color.setHSL(0.5 + pulse * 0.2, 1, 0.5);

      this.particles.rotation.y += 0.0005 + pulse * 0.003;
      this.particles.position.y = Math.sin(Date.now() * 0.001) * 1;

      const isBeat = pulse > 0.35 && (pulse - this.lastPulse) > 0.08;
      this.lastPulse = pulse;
      if (isBeat) {
        const burst = Math.floor(pulse * 3) + 1;
        for (let i = 0; i < burst; i++) this.spawnMeteor(pulse);
      }
    }

    this.updateMeteors();
    if (this.controls) this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  public resize(width: number, height: number) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  public dispose() {
    if (this.controls) this.controls.dispose();
    this.renderer.dispose();
    if (this.currentPreset) this.currentPreset.dispose(this.scene);
    this.scene.clear();
    this.meteors.forEach(m => {
      this.scene.remove(m.mesh);
      m.mesh.geometry.dispose();
      if (m.mesh.material instanceof THREE.Material) m.mesh.material.dispose();
    });
    this.meteors = [];
  }
}
