import type { LyricEmotion, EmotionScore } from './ai';

/**
 * 视觉参数输出接口
 * 这些参数可以直接映射到 CSS 样式、Canvas 绘图或 Three.js 材质属性
 */
export interface VisualState {
  color: string;           // 主色调 (CSS HSL/RGB)
  secondaryColor: string;  // 辅助色
  scale: number;           // 缩放比例 (基于 RMS)
  brightness: number;      // 亮度 (基于 Energy/RMS)
  shake: number;           // 抖动强度 (基于 PerceptualSharpness)
  waveFreq: number;        // 波动频率 (基于 ZCR)
  particleCount: number;   // 粒子产生率 (基于 Energy)
  rotation: number;        // 旋转角度
  glitch: number;          // 干扰强度 (Desperate 专用)
  opacity: number;         // 透明度
  tag: string;             // 当前情感标签
  rhythmWeight: number;    // 节奏权重
  rhythmType: 'burst' | 'stretch'; // 节奏类型
}

/**
 * VisualEngine: 核心视觉动力引擎
 * 负责将音频特征 (Meyda) 与 语义情感 (EmotionEngine) 融合并映射为视觉参数
 */
export class VisualEngine {
  private currentState: VisualState;
  private targetState: VisualState;
  private lerpFactor = 0.1; // 平滑因子

  constructor() {
    this.currentState = this.getInitialState();
    this.targetState = this.getInitialState();
  }

  private getInitialState(): VisualState {
    return {
      color: 'hsl(200, 50%, 50%)',
      secondaryColor: 'hsl(220, 50%, 30%)',
      scale: 1,
      brightness: 1,
      shake: 0,
      waveFreq: 0,
      particleCount: 0,
      rotation: 0,
      glitch: 0,
      opacity: 1,
      tag: 'Calm',
      rhythmWeight: 1,
      rhythmType: 'burst'
    };
  }

  /**
   * 核心更新函数，在渲染循环 (requestAnimationFrame) 中调用
   * @param features Meyda 提取的音频特征
   * @param emotion AI 分析的情感数据
   * @param lineIndex 当前歌词行索引
   * @param duration 当前行持续时间 (ms)
   */
  public update(features: any, emotion: LyricEmotion | null, lineIndex: number, duration: number = 1000): VisualState {
    if (!features) return this.currentState;

    // 1. 获取全局情感数值作为基准
    const g = emotion?.global;
    const gValence = typeof g === 'object' ? (g.valence || 0) : 0;
    const gArousal = typeof g === 'object' ? (g.arousal || 0.5) : 0.5;
    const globalTag = typeof g === 'string' ? g : (g?.tag || 'Calm');

    const currentEmotion = this.getActiveEmotion(emotion, lineIndex);

    // 2. 结合局部与全局情感计算目标状态 (传入全局基准)
    this.calculateTargetState(features, currentEmotion, globalTag, gValence, gArousal);

    // 3. 计算节奏因子
    const rhythm = this.getRhythmFactor(duration);
    this.currentState.rhythmWeight = rhythm.weight;
    this.currentState.rhythmType = rhythm.type;

    // 3. 线性插值 (Lerp) 实现平滑过渡
    this.applyLerp();

    // 4. 同步 Tag
    this.currentState.tag = currentEmotion.tag;

    return this.currentState;
  }

  /**
   * 获取当前行对应的具体情感
   */
  private getActiveEmotion(emotion: LyricEmotion | null, lineIndex: number): EmotionScore {
    const defaultEmotion: EmotionScore = { valence: 0, arousal: 0.2, tag: 'Calm' };
    if (!emotion) return defaultEmotion;

    const segment = emotion.segments.find(s => lineIndex >= s.start && lineIndex <= s.end);
    if (segment) return segment.emotion;

    // 如果没有找到片段情感，尝试从 global 中提取，如果 global 也是对象则返回它，否则返回默认
    if (typeof emotion.global !== 'string' && emotion.global?.tag) {
      return emotion.global;
    }

    return { ...defaultEmotion, tag: typeof emotion.global === 'string' ? emotion.global : 'Calm' };
  }

  /**
   * 核心逻辑：根据音频特征和 AI 情感数据计算目标视觉状态
   */
  private calculateTargetState(f: any, e: EmotionScore, globalTag: string, gValence: number, gArousal: number) {
    // 情感混合：局部情感在全局基准上进行偏移
    const valence = Math.max(-1, Math.min(1, e.valence + gValence * 0.4));
    const arousal = Math.max(0, Math.min(1, e.arousal + gArousal * 0.3));
    const tag = e.tag;
    console.log(tag);

    // 基础参数映射
    const rms = f.rms || 0;
    const energy = f.energy || 0;
    const zcr = f.zcr || 0;
    const spread = f.perceptualSpread || 0;
    const sharpness = f.perceptualSharpness || 0;

    // 情感权重因子 (用于微调音频特征的影响力)
    const arousalFactor = 1 + arousal;
    const valenceShift = valence * 25;

    // 全局情感修正
    let globalHueShift = 0;
    let globalIntensityMod = 1.0;

    if (globalTag === 'Passionate') {
      globalHueShift = -20; // 向红色/暖色偏移
      globalIntensityMod = 1.3; // 全局增强爆发力
    } else if (globalTag === 'Melancholy') {
      globalHueShift = 40; // 向冷色偏移
      globalIntensityMod = 0.8;
    }

    switch (tag) {
      case 'Passionate':
        // 激情：极高亮度，产生辉光感
        const passionateHue = 10 + (valence * 20) + (rms * 20); // 10-50 之间
        this.targetState.color = `hsl(${passionateHue}, 100%, ${55 + valence * 15}%)`;
        this.targetState.secondaryColor = '#ffcc00';
        this.targetState.scale = (1 + rms * 0.4) * (0.95 + arousal * 0.1);
        this.targetState.brightness = (1.5 + energy * 2.0) * arousalFactor; // 强力拉高
        this.targetState.shake = rms * 8 * arousal;
        this.targetState.particleCount = energy * 100 * arousal;
        this.targetState.waveFreq = 2 + arousal;
        this.targetState.glitch = 0;
        break;

      case 'Calm':
        // 中性偏冷：温润的亮色
        const calmHue = 170 + valenceShift;
        this.targetState.color = `hsl(${calmHue}, ${40 + valence * 20}%, 70%)`;
        this.targetState.secondaryColor = '#e0f7fa';
        this.targetState.scale = 1 + rms * 0.15;
        this.targetState.brightness = 1.2 + rms + valence * 0.3; // 保持明亮
        this.targetState.waveFreq = zcr * 0.1 * (1 - arousal * 0.5);
        this.targetState.shake = 0;
        this.targetState.glitch = 0;
        this.targetState.particleCount = 0;
        break;

      case 'Melancholy':
        // 失落：忧郁但清晰的冷光
        const melancholyHue = 230 + valenceShift;
        const melancholySat = Math.max(20, 50 + valence * 25);
        this.targetState.color = `hsl(${melancholyHue}, ${melancholySat}%, ${Math.max(60, 65 + valence * 15)}%)`;
        this.targetState.secondaryColor = '#1a237e';
        this.targetState.scale = 0.98 + rms * 0.2;
        this.targetState.brightness = 1.0 + rms + valence * 0.2;
        this.targetState.waveFreq = 0.5;
        this.targetState.shake = 0;
        this.targetState.glitch = Math.abs(valence) * 2;
        this.targetState.opacity = 0.8;
        break;

      case 'Desperate':
        // 绝望：刺眼的冷色高亮
        const desperateHue = 210 + (valence * 30);
        const desperateLight = 55 + (rms * 40) + (valence * 10);
        this.targetState.color = `hsl(${desperateHue}, 45%, ${Math.max(60, desperateLight)}%)`; // 提高可见度和亮度
        this.targetState.secondaryColor = '#311b92'; // 深紫色辅助，防止全黑
        this.targetState.scale = (1 + rms * 0.3) * (0.95 + arousal * 0.1);
        this.targetState.brightness = (1.2 + energy * 1.5) * arousalFactor; // 补上缺失的亮度！
        this.targetState.glitch = (spread * 2 + arousal * 5) * Math.abs(valence);
        this.targetState.shake = sharpness * 1 + arousal * 5;
        this.targetState.opacity = 0.8 + rms * 0.2;
        this.targetState.particleCount = spread * 50 * arousal;
        break;

      default:
        this.targetState = this.getInitialState();
    }

    // 应用全局情感修饰
    this.targetState.shake *= globalIntensityMod;
    this.targetState.brightness *= globalIntensityMod;
    this.targetState.scale *= (0.9 + globalIntensityMod * 0.1);

    // 注入全局色调底色 (混合 HSL)
    if (globalHueShift !== 0) {
      // 简单的 HSL 混合：从字符串中提取 H，增加位移后再拼回去
      const hueMatch = this.targetState.color.match(/hsl\((\d+\.?\d*)/);
      if (hueMatch) {
        const currentHue = parseFloat(hueMatch[1]);
        const newHue = (currentHue + globalHueShift + 360) % 360;
        this.targetState.color = this.targetState.color.replace(/hsl\(\d+\.?\d*/, `hsl(${newHue}`);
      }
    }
  }

  /**
   * 线性插值平滑处理
   */
  private applyLerp() {
    const lerp = (start: number, end: number, t: number) => start + (end - start) * t;

    this.currentState.scale = lerp(this.currentState.scale, this.targetState.scale, this.lerpFactor);
    this.currentState.brightness = lerp(this.currentState.brightness, this.targetState.brightness, this.lerpFactor);
    this.currentState.shake = lerp(this.currentState.shake, this.targetState.shake, this.lerpFactor);
    this.currentState.waveFreq = lerp(this.currentState.waveFreq, this.targetState.waveFreq, this.lerpFactor);
    this.currentState.particleCount = lerp(this.currentState.particleCount, this.targetState.particleCount, this.lerpFactor);
    this.currentState.glitch = lerp(this.currentState.glitch, this.targetState.glitch, this.lerpFactor);
    this.currentState.opacity = lerp(this.currentState.opacity, this.targetState.opacity, this.lerpFactor);

    // 颜色插值 (简化处理，实际可以使用 d3-color 或类似库)
    this.currentState.color = this.targetState.color;
    this.currentState.secondaryColor = this.targetState.secondaryColor;
  }

  /**
   * 根据歌词时长计算节奏层影响因子
   * @param duration 歌词占用的毫秒数
   */
  public getRhythmFactor(duration: number): { type: 'burst' | 'stretch', weight: number } {
    if (duration < 500) {
      // 短促爆发 (Rap/快节奏)
      return { type: 'burst', weight: Math.min(2, 500 / duration) };
    } else if (duration > 2000) {
      // 长音拉伸 (抒情/拖腔)
      return { type: 'stretch', weight: Math.min(3, duration / 2000) };
    }
    return { type: 'burst', weight: 1 };
  }
}
