import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/**
 * 视觉渲染类：赛博朋克风对称频谱隧道 + 动态流星系统
 */
export class Visualizer {
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private controls!: OrbitControls;

  // 核心组件
  private barsUpper: THREE.Mesh[] = [];
  private barsLower: THREE.Mesh[] = [];
  private particles!: THREE.Points;
  private centerLight!: THREE.PointLight;

  // 流星系统
  private meteors: { mesh: THREE.Mesh; velocity: THREE.Vector3; life: number }[] = [];
  private readonly MAX_METEORS = 20;

  private readonly BAR_COUNT = 128;
  private readonly RADIUS = 8;
  private lastPulse = 0; // 用于节拍检测

  /**
   * 初始化 3D 场景
   */
  public init(container: HTMLElement) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x020205);
    this.scene.fog = new THREE.FogExp2(0x020205, 0.015); // 大幅降低雾气浓度，确保能看清远处的流星

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

    // 分步初始化组件
    this.initPillars();
    this.initParticles();
    this.initEnvironment();
  }

  /**
   * 初始化对称频谱光柱
   */
  private initPillars() {
    const geometry = new THREE.BoxGeometry(0.15, 1, 0.15);
    const half = this.BAR_COUNT / 2;

    for (let i = 0; i < this.BAR_COUNT; i++) {
      // 计算角度：0~63 往顺时针走半圈，64~127 往逆时针走半圈
      // 这样低频（i=0 和 i=64）都会从同一个起点出发
      let angle;
      const localIdx = i % half;
      const ratio = localIdx / half;
      
      if (i < half) {
        angle = ratio * Math.PI; // 顺时针半圈 (0 -> PI)
      } else {
        angle = -ratio * Math.PI; // 逆时针半圈 (0 -> -PI)
      }

      const x = Math.cos(angle) * this.RADIUS;
      const z = Math.sin(angle) * this.RADIUS;

      // 颜色也保持对称
      const color = new THREE.Color().setHSL(ratio, 0.8, 0.5);
      const material = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 1,
        metalness: 0.8,
        roughness: 0.2
      });

      // 上半部分光柱
      const barUpper = new THREE.Mesh(geometry, material);
      barUpper.position.set(x, 0, z);
      this.scene.add(barUpper);
      this.barsUpper.push(barUpper);

      // 下半部分光柱 (镜像)
      const barLower = new THREE.Mesh(geometry, material);
      barLower.position.set(x, 0, z);
      this.scene.add(barLower);
      this.barsLower.push(barLower);
    }
  }

  /**
   * 初始化背景粒子星空
   */
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

  /**
   * 初始化光照环境
   */
  private initEnvironment() {
    this.centerLight = new THREE.PointLight(0x00ffff, 0, 50);
    this.scene.add(this.centerLight);

    const ambient = new THREE.AmbientLight(0xffffff, 0.2);
    this.scene.add(ambient);
  }

  /**
   * 产生流星
   */
  private spawnMeteor(pulse: number) {
    if (this.meteors.length >= this.MAX_METEORS) return;

    const geometry = new THREE.CylinderGeometry(0, 0.02, 6, 4);
    
    // 颜色随能量变化：强拍更亮更偏蓝/紫色
    const hue = (0.5 + pulse * 0.3) % 1.0;
    const color = new THREE.Color().setHSL(hue, 0.9, 0.6);
    
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending
    });
    const meteor = new THREE.Mesh(geometry, material);

    // 起始位置
    const x = (Math.random() - 0.5) * 80;
    const y = 25 + Math.random() * 15;
    const z = (Math.random() - 0.5) * 60;
    meteor.position.set(x, y, z);

    // 减慢速度，增加律动感
    const speed = 0.5 + pulse * 1.5; 
    const velocity = new THREE.Vector3(
      (x > 0 ? -1 : 1) * (speed * 0.6),
      -speed * 0.4,
      (Math.random() - 0.5) * speed
    );
    
    meteor.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), velocity.clone().normalize());

    this.scene.add(meteor);
    this.meteors.push({ mesh: meteor, velocity, life: 1.0 });
  }

  /**
   * 更新流星状态
   */
  private updateMeteors() {
    for (let i = this.meteors.length - 1; i >= 0; i--) {
      const m = this.meteors[i];
      m.mesh.position.add(m.velocity);
      m.life -= 0.012; // 下落生命值消耗

      if (m.mesh.material instanceof THREE.MeshBasicMaterial) {
        m.mesh.material.opacity = Math.max(0, m.life);
      }

      // 销毁条件：生命耗尽或掉出视野
      if (m.life <= 0 || m.mesh.position.y < -20) {
        this.scene.remove(m.mesh);
        m.mesh.geometry.dispose();
        if (m.mesh.material instanceof THREE.Material) m.mesh.material.dispose();
        this.meteors.splice(i, 1);
      }
    }
  }

  /**
   * 渲染更新循环
   */
  public update(dataArray: Uint8Array | null) {
    if (dataArray) {
      const fftSize = dataArray.length;
      let totalEnergy = 0;

      const half = this.BAR_COUNT / 2;
      for (let i = 0; i < half; i++) {
        // 只需要计算一半的数据，然后同时更新对称的两侧
        const index = Math.floor(Math.pow(i / half, 1.3) * fftSize * 0.7);
        const value = dataArray[index] || 0;
        totalEnergy += value * 2;

        const scale = 0.1 + (value / 255) * 12;
        
        // 更新顺时针侧 (索引 i)
        this.updatePillarPair(i, scale, value);
        // 更新逆时针侧 (索引 i + half)
        this.updatePillarPair(i + half, scale, value);
      }

      // 使用峰值能量检测
      const maxVal = Math.max(...Array.from(dataArray));
      const pulse = maxVal / 255;

      // 环境灯光与粒子联动
      this.centerLight.intensity = pulse * 120;
      this.centerLight.color.setHSL(0.5 + pulse * 0.2, 1, 0.5);

      // 大幅降低背景粒子旋转速度，增加氛围感
      this.particles.rotation.y += 0.0005 + pulse * 0.003;
      this.particles.position.y = Math.sin(Date.now() * 0.001) * 1;

      // 智能节拍检测 (Beat Detection)
      // 检查当前能量是否比上一帧有显著跳跃
      const isBeat = pulse > 0.35 && (pulse - this.lastPulse) > 0.08;
      this.lastPulse = pulse;

      if (isBeat) {
        // 节拍爆发：根据能量强度产生 1~3 颗流星
        const burst = Math.floor(pulse * 3) + 1;
        for (let i = 0; i < burst; i++) {
          this.spawnMeteor(pulse);
        }
      }
    }

    // 每一帧都更新流星位置
    this.updateMeteors();

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * 辅助方法：更新一对光柱（上+下）
   */
  private updatePillarPair(idx: number, scale: number, value: number) {
    if (!this.barsUpper[idx]) return;
    
    // 平滑高度
    this.barsUpper[idx].scale.y = THREE.MathUtils.lerp(this.barsUpper[idx].scale.y, scale, 0.2);
    this.barsUpper[idx].position.y = this.barsUpper[idx].scale.y / 2;

    this.barsLower[idx].scale.y = this.barsUpper[idx].scale.y;
    this.barsLower[idx].position.y = -this.barsLower[idx].scale.y / 2;

    // 动态自发光
    const emissiveIntensity = 0.5 + (value / 255) * 4;
    (this.barsUpper[idx].material as THREE.MeshStandardMaterial).emissiveIntensity = emissiveIntensity;
    (this.barsLower[idx].material as THREE.MeshStandardMaterial).emissiveIntensity = emissiveIntensity;
  }

  /**
   * 窗口适配
   */
  public resize(width: number, height: number) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  /**
   * 资源销毁
   */
  public dispose() {
    this.controls.dispose();
    this.renderer.dispose();
    this.scene.clear();
    // 清理流星资源
    this.meteors.forEach(m => {
      this.scene.remove(m.mesh);
      m.mesh.geometry.dispose();
      if (m.mesh.material instanceof THREE.Material) m.mesh.material.dispose();
    });
    this.meteors = [];
  }
}
