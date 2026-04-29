
/**
 * 解决 B 站 412 风险控制产生的验证码挑战
 * 参考 g.js 逻辑，使用 Web Crypto API 进行 SHA256 碰撞
 */

async function sha256(data: string): Promise<string> {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 计算 PoW 结果
 * @param q 盐值 (a)
 * @param r 目标哈希 (b)
 */
async function solvePow(q: string, r: string): Promise<number | null> {
    const limit = 5000000;
    for (let i = 0; i < limit; i++) {
        const hash = await sha256(q + i.toString());
        if (hash === r) {
            return i;
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
