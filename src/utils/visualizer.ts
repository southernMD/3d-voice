import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/**
 * 视觉渲染类：负责 Three.js 场景管理及频谱动画更新
 */
export class Visualizer {
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private controls!: OrbitControls;
  private bars: THREE.Mesh[] = [];
  
  private readonly BAR_COUNT = 64;
  private readonly RADIUS = 5;

  /**
   * 初始化 Three.js 环境
   * @param container 挂载的 DOM 元素
   */
  public init(container: HTMLElement) {
    // 1. 场景与雾气效果
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x050505);
    this.scene.fog = new THREE.FogExp2(0x050505, 0.08);

    // 2. 摄像机设置
    this.camera = new THREE.PerspectiveCamera(
      75, 
      container.clientWidth / container.clientHeight, 
      0.1, 
      1000
    );
    this.camera.position.set(0, 10, 15);

    // 3. 渲染器设置
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    // 4. 控制器设置 (自由视角)
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true; // 启用阻尼效果，增加丝滑感
    this.controls.dampingFactor = 0.05;
    this.controls.maxDistance = 30;
    this.controls.minDistance = 5;
    this.controls.maxPolarAngle = Math.PI / 2; // 限制不能看到地板下方
    this.controls.enablePan = false; // 禁用平移，只允许旋转和缩放

    // 5. 灯光系统
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
    this.scene.add(ambientLight);

    const pointLight1 = new THREE.PointLight(0x00ffff, 2, 50);
    pointLight1.position.set(10, 10, 10);
    this.scene.add(pointLight1);

    const pointLight2 = new THREE.PointLight(0xff00ff, 2, 50);
    pointLight2.position.set(-10, 10, -10);
    this.scene.add(pointLight2);

    // 6. 创建频谱柱体并排列成圆形
    const geometry = new THREE.BoxGeometry(0.5, 1, 0.5);
    for (let i = 0; i < this.BAR_COUNT; i++) {
      const angle = (i / this.BAR_COUNT) * Math.PI * 2;
      const x = Math.cos(angle) * this.RADIUS;
      const z = Math.sin(angle) * this.RADIUS;

      // 渐变色材质
      const color = new THREE.Color().setHSL(i / this.BAR_COUNT, 0.8, 0.6);
      const material = new THREE.MeshStandardMaterial({ 
        color,
        emissive: color,
        emissiveIntensity: 0.1,
        metalness: 0.9,
        roughness: 0.1
      });

      const bar = new THREE.Mesh(geometry, material);
      bar.position.set(x, 0, z);
      bar.rotation.y = -angle; 
      this.scene.add(bar);
      this.bars.push(bar);
    }

    // 7. 地面网格
    const gridHelper = new THREE.GridHelper(30, 30, 0x222222, 0x111111);
    gridHelper.position.y = -0.5;
    this.scene.add(gridHelper);
  }

  /**
   * 更新循环：更新频谱柱高度及控制器
   * @param dataArray 频率数据数组
   */
  public update(dataArray: Uint8Array | null) {
    if (dataArray) {
      for (let i = 0; i < this.BAR_COUNT; i++) {
        const dataIndex = Math.floor((i / this.BAR_COUNT) * dataArray.length * 0.7);
        const value = dataArray[dataIndex];
        const scale = 0.1 + (value / 255) * 12;
        
        // 平滑插值更新
        this.bars[i].scale.y = THREE.MathUtils.lerp(this.bars[i].scale.y, scale, 0.15);
        this.bars[i].position.y = this.bars[i].scale.y / 2 - 0.5;
        
        // 动态修改自发光强度
        (this.bars[i].material as THREE.MeshStandardMaterial).emissiveIntensity = (value / 255) * 1.5;
      }
    }

    // 更新控制器
    this.controls.update();

    this.renderer.render(this.scene, this.camera);
  }

  /**
   * 窗口大小改变时的适配逻辑
   */
  public resize(width: number, height: number) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  /**
   * 销毁资源
   */
  public dispose() {
    this.controls.dispose();
    this.renderer.dispose();
    this.scene.clear();
  }
}
