/**
 * 必剪 ASR 服务 - 前端发送端
 * 将音频 Blob 流式上传至后端代理接口执行识别
 */
export class ASRService {
  /**
   * 语音转文字
   * @param blob 音频 Blob 数据
   */
  static async transcribe(blob: Blob): Promise<any> {
    try {
      console.log("[ASR] 正在上传音频至后端进行识别...");
      
      // 直接将全部格式强制转为 mp3 发送，避免被必剪后缀校验拦截
      const format = 'mp3';

      const response = await fetch(`/music-api/resolve/asr/bcut?format=${format}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream"
        },
        body: blob
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "识别请求失败");
      }

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.message || "识别逻辑执行失败");
      }

      console.log("[ASR] 识别成功:", result.data);
      return result.data;
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
