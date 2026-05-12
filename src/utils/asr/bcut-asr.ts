/**
 * 必剪云端语音识别接口 Frontend/TypeScript 实现
 */

const API_REQ_UPLOAD = '/bcut-api/x/bcut/rubick-interface/resource/create';
const API_COMMIT_UPLOAD = '/bcut-api/x/bcut/rubick-interface/resource/create/complete';
const API_CREATE_TASK = '/bcut-api/x/bcut/rubick-interface/task';
const API_QUERY_RESULT = '/bcut-api/x/bcut/rubick-interface/task/result';

export const ResultState = {
  STOP: 0,
  RUNNING: 1,
  ERROR: 3,
  COMPLETE: 4,
} as const

export interface ASRResult {
  task_id: string;
  result: string;
  remark: string;
  state: typeof ResultState[keyof typeof ResultState];
}

export class BcutASR {
  private soundBin: Uint8Array | null = null;
  private soundName: string = '';
  private soundFmt: string = '';
  private taskId: string | null = null;
  private etags: string[] = [];

  private inBossKey: string = '';
  private resourceId: string = '';
  private uploadId: string = '';
  private uploadUrls: string[] = [];
  private perSize: number = 0;
  private downloadUrl: string = '';

  private headers = {
    // 浏览器环境不能随意修改 User-Agent, 会被拒绝
    // 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)...'
  };

  public setArrayBufferData(buffer: ArrayBuffer, fileName: string): void {
    this.soundBin = new Uint8Array(buffer);
    this.soundName = fileName;
    this.soundFmt = fileName.split('.').pop() || 'mp3';
    console.log(`加载Buffer成功: ${this.soundName}`);
  }

  public async upload(): Promise<void> {
    if (!this.soundBin || !this.soundFmt) {
      throw new Error('No data set');
    }

    const params = new URLSearchParams();
    params.append('type', '2');
    params.append('name', this.soundName);
    params.append('size', this.soundBin.byteLength.toString());
    params.append('resource_file_type', this.soundFmt);
    params.append('model_id', '7');

    const resp = await fetch(API_REQ_UPLOAD, {
      method: 'POST',
      headers: { ...this.headers, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const data = await resp.json() as any;

    if (data.code !== 0) {
      throw new Error(`API Error: ${data.code} - ${data.message}`);
    }

    const d = data.data;
    this.inBossKey = d.in_boss_key;
    this.resourceId = d.resource_id;
    this.uploadId = d.upload_id;
    this.uploadUrls = d.upload_urls;
    this.perSize = d.per_size;

    console.log(`申请上传成功, ${Math.floor(d.size / 1024)}KB, ${this.uploadUrls.length}分片`);

    await this.uploadParts();
    await this.commitUpload();
  }

  private async uploadParts(): Promise<void> {
    if (!this.soundBin) return;

    for (let i = 0; i < this.uploadUrls.length; i++) {
      const start = i * this.perSize;
      const end = (i + 1) * this.perSize;
      const chunk = this.soundBin.slice(start, end);

      // 使用路径格式重写来绕过 Vercel Edge 4.5MB 限制
      // 格式: /bcut-upload-proxy/http/domain.com/path?query
      const originalUrl = new URL(this.uploadUrls[i]);
      const protocol = originalUrl.protocol.replace(':', '');
      const uploadUrl = `/bcut-upload-proxy/${protocol}/${originalUrl.hostname}${originalUrl.pathname}${originalUrl.search}`;

      const resp = await fetch(uploadUrl, {
        method: 'PUT',
        body: chunk,
      });
      const etag = resp.headers.get('etag') || resp.headers.get('Etag');
      if (etag) {
        this.etags.push(etag.replace(/"/g, ''));
      }
    }
  }

  private async commitUpload(): Promise<void> {
    const params = new URLSearchParams();
    params.append('in_boss_key', this.inBossKey);
    params.append('resource_id', this.resourceId);
    params.append('etags', this.etags.join(','));
    params.append('upload_id', this.uploadId);
    params.append('model_id', '7');

    const resp = await fetch(API_COMMIT_UPLOAD, {
      method: 'POST',
      headers: { ...this.headers, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const data = await resp.json() as any;

    if (data.code !== 0) {
      throw new Error(`API Error: ${data.code} - ${data.message}`);
    }

    this.downloadUrl = data.data.download_url;
  }

  public async createTask(): Promise<string> {
    if (!this.downloadUrl) {
      throw new Error('Upload not completed');
    }

    const resp = await fetch(API_CREATE_TASK, {
      method: 'POST',
      headers: { ...this.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resource: this.downloadUrl,
        model_id: '7',
      }),
    });
    const data = await resp.json() as any;

    if (data.code !== 0) {
      throw new Error(`API Error: ${data.code} - ${data.message}`);
    }

    this.taskId = data.data.task_id;
    console.log(`任务已创建: ${this.taskId}`);
    return this.taskId!;
  }

  public async getResult(taskId?: string): Promise<ASRResult> {
    const tid = taskId || this.taskId;
    if (!tid) throw new Error('No task ID');

    const params = new URLSearchParams({
      model_id: '7',
      task_id: tid,
    });

    const resp = await fetch(`${API_QUERY_RESULT}?${params.toString()}`, {
      method: 'GET',
      headers: this.headers,
    });
    const data = await resp.json() as any;

    if (data.code !== 0) {
      throw new Error(`API Error: ${data.code} - ${data.message}`);
    }

    return data.data;
  }

  /**
   * 一键识别ArrayBuffer并输出 JSON
   * @param buffer 音频文件ArrayBuffer
   * @param fileName 音频文件名称
   * @returns 识别结果 JSON 对象
   */
  public async transcribeBuffer(buffer: ArrayBuffer, fileName: string): Promise<any> {
    this.setArrayBufferData(buffer, fileName);
    await this.upload();
    await this.createTask();

    while (true) {
      const res = await this.getResult();
      if (res.state === ResultState.COMPLETE) {
        return JSON.parse(res.result);
      } else if (res.state === ResultState.ERROR) {
        throw new Error(`Recognition failed: ${res.remark}`);
      }
      // 等待 1 秒后重试
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}
