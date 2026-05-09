import { BcutASR } from './bcut-asr';

/**
 * 必剪 ASR 服务 - 前端发送端
 * 直接在前端调用 BcutASR 并使用代理
 */
export class ASRService {
  /**
   * 语音转文字
   * @param blob 音频 Blob 数据
   */
  static async transcribe(blob: Blob): Promise<any> {
    try {
      console.log("[ASR] 正在直接调用必剪接口进行识别...");
      
      const format = 'mp3';
      const arrayBuffer = await blob.arrayBuffer();

      const asr = new BcutASR();
      const result = await asr.transcribeBuffer(arrayBuffer, `audio.${format}`);
      
      console.log("[ASR] 识别成功:", result);
      return result;
    } catch (err: any) {
      console.error("[ASR] 流程出错:", err.message);
      throw err;
    }
  }
}

/**
 * 导出单例/便捷服务
 */
export const asrService = ASRService;
