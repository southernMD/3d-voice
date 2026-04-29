
/**
 * 解决 B 站 412 风险控制产生的验证码挑战
 * 参考 g.js 逻辑，使用 Web Crypto API 进行 SHA256 碰撞
 */

const encoder = new TextEncoder();
const hexTable = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));

function bufToHex(buffer: ArrayBuffer): string {
    const uint8Arr = new Uint8Array(buffer);
    let hex = '';
    for (let i = 0; i < uint8Arr.length; i++) {
        hex += hexTable[uint8Arr[i]];
    }
    return hex;
}

/**
 * 计算 PoW 结果 (并行优化版)
 * @param q 盐值 (a)
 * @param r 目标哈希 (b)
 */
async function solvePow(q: string, r: string): Promise<number | null> {
    const limit = 5000000;
    const batchSize = 250; // 每批次并行处理的数量

    for (let i = 0; i < limit; i += batchSize) {
        const promises: Promise<ArrayBuffer>[] = [];
        
        for (let j = 0; j < batchSize && (i + j) < limit; j++) {
            const data = encoder.encode(q + (i + j).toString());
            promises.push(crypto.subtle.digest('SHA-256', data));
        }

        const buffers = await Promise.all(promises);
        
        for (let j = 0; j < buffers.length; j++) {
            if (bufToHex(buffers[j]) === r) {
                return i + j;
            }
        }

        // 每处理 10 万次打个日志，方便观察进度
        if (i % 100000 === 0 && i > 0) {
            console.log(`[Captcha] Progress: ${i}/${limit}`);
        }
    }
    return null;
}

/**
 * 处理 412 挑战并获取新的 SEC-TOKEN
 * @param input 包含 X-BILI-SEC-TOKEN 的原始字符串（通常是 set-cookie 内容）
 */
export async function getNewSecToken(input: string): Promise<string | null> {
    try {
        // 1. 使用正则精准提取 JWT 格式的部分 (A.B.C)
        // JWT 格式通常是 base64url 字符组成的三段，中间用点分隔
        const jwtRegex = /([a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+)/;
        const match = input.match(jwtRegex);
        
        if (!match) {
            console.error('[Captcha] Could not find JWT in input');
            return null;
        }
        
        const token = match[1];
        const parts = token.split('.');
        
        // 2. 解析 Payload (第二部分)
        // Base64 解码 (处理 URL Safe Base64)
        const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const payloadRaw = atob(base64);
        const { q, r } = JSON.parse(payloadRaw);

        console.log(`[Captcha] Solving challenge: q=${q}, r=${r}`);
        
        // 3. 计算结果
        const result = await solvePow(q, r);
        if (result === null) {
            console.error('[Captcha] Failed to solve PoW');
            return null;
        }

        console.log(`[Captcha] Solved! Result: ${result}`);

        // 4. 提交验证
        const response = await fetch('https://security.bilibili.com/th/captcha/cc/check', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Referer': 'https://www.bilibili.com/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            body: new URLSearchParams({
                result: result.toString(),
                token: token
            })
        });

        const data = await response.json();
        // 根据要求：返回 { "message": "xxx-token" }
        if (data && data.message) {
            console.log(`[Captcha] Success! New token received.`);
            return data.message;
        }

        return null;
    } catch (e) {
        console.error('[Captcha] Error during solving:', e);
        return null;
    }
}
