import type { NeteaseLrcLine, UtteranceRecord, WordRecord } from "@/types/music";

// 解析网易云 LRC 歌词
export function parseNeteaseLrc(lrcStr: string): NeteaseLrcLine[] {
    const lines = lrcStr.split('\n');
    const result: NeteaseLrcLine[] = [];
    // 匹配更广泛的 LRC 时间格式: [00:00.00], [0:00.00], [00:00]
    const regex = /\[(\d+):(\d+(?:\.\d+)?)\](.*)/;

    for (const line of lines) {
        const match = line.match(regex);
        if (match) {
            const min = parseInt(match[1]);
            const sec = parseFloat(match[2]);
            const timeMs = Math.round((min * 60 + sec) * 1000);
            const text = match[3].trim();
            if (text) {
                result.push({ start_time: timeMs, end_time: 0, text });
            }
        }
    }

    // 封装 end_time
    for (let i = 0; i < result.length; i++) {
        result[i].end_time = i < result.length - 1 ? result[i + 1].start_time : result[i].start_time + 5000;
    }

    return result;
}

// 智能分词：中文字符按字切分，英文字符按单词切分
export function tokenize(text: string): string[] {
    // 匹配：中文字符 | 英文单词(含撇号)及其后的空格标点 | 其他非空白连续字符
    const regex = /[\u4e00-\u9fa5]|[a-zA-Z0-9']+(?:[^a-zA-Z0-9\u4e00-\u9fa5]+)?|[^\s\u4e00-\u9fa5a-zA-Z0-9']+/g;
    return text.match(regex) || [];
}

// 用 A歌词(官方LRC) 作为基准，将 B歌词(ASR结果) 映射融合进去
export function mergeLyrics(bLines: UtteranceRecord[], aLines: NeteaseLrcLine[]): UtteranceRecord[] {
    if (!aLines || aLines.length === 0) return bLines;

    // 1. 提取所有 B 端的逐字数据到一个大池子里
    const allBWords: WordRecord[] = [];
    for (const b of bLines) {
        if (b.words && b.words.length > 0) {
            allBWords.push(...b.words);
        }
    }

    // 2. 将每个 B 端的字分配给与其重叠度最高的 A 端句子
    const aToWords = new Map<number, WordRecord[]>();

    for (const w of allBWords) {
        let bestAIndex = -1;
        let maxOverlap = 0;

        for (let j = 0; j < aLines.length; j++) {
            const a = aLines[j];
            // 计算这个字与 A 句子的重叠时长
            const overlap = Math.max(0, Math.min(w.end_time, a.end_time) - Math.max(w.start_time, a.start_time));
            if (overlap > maxOverlap) {
                maxOverlap = overlap;
                bestAIndex = j;
            }
        }

        // 如果这个字和某个 A 句子有交集，就归给它
        if (bestAIndex !== -1 && maxOverlap > 0) {
            if (!aToWords.has(bestAIndex)) {
                aToWords.set(bestAIndex, []);
            }
            aToWords.get(bestAIndex)!.push(w);
        }
    }

    // 3. 遍历官方 A 歌词，填充文字并输出
    const finalLines: UtteranceRecord[] = [];

    for (let j = 0; j < aLines.length; j++) {
        const a = aLines[j];
        const AText = a.text;
        const tokens = tokenize(AText);
        const associatedWords = aToWords.get(j) || [];

        if (associatedWords.length > 0 && tokens.length > 0) {
            // 按照时间从小到大排序（确保歌词顺序正确）
            associatedWords.sort((x, y) => x.start_time - y.start_time);

            const newWords: WordRecord[] = [];

            if (tokens.length <= associatedWords.length) {
                // 情况 1: A端 Token 数小于等于 B端词位
                // 1对1分配，最后一个 Token 吞掉 B端剩余的所有时间片
                for (let i = 0; i < tokens.length; i++) {
                    const w = associatedWords[i];
                    if (i === tokens.length - 1) {
                        const lastW = associatedWords[associatedWords.length - 1];
                        newWords.push({ ...w, label: tokens[i], end_time: Math.max(w.end_time, lastW.end_time) });
                    } else {
                        newWords.push({ ...w, label: tokens[i] });
                    }
                }
            } else {
                // 情况 2: A端 Token 数多于 B端词位
                // 1对1分配，最后一个词位吞掉 A端剩余的所有 Token
                for (let i = 0; i < associatedWords.length; i++) {
                    const w = associatedWords[i];
                    if (i === associatedWords.length - 1) {
                        newWords.push({ ...w, label: tokens.slice(i).join('') });
                    } else {
                        newWords.push({ ...w, label: tokens[i] });
                    }
                }
            }

            // 核心修复：强制让最后一个词的结束时间等于整句的结束时间
            // 防止因 ASR 尾部静音导致最后一个词提前消失
            if (newWords.length > 0) {
                newWords[newWords.length - 1].end_time = a.end_time;
            }

            finalLines.push({
                transcript: AText,
                start_time: Math.min(a.start_time, associatedWords[0].start_time),
                end_time: Math.max(a.end_time, associatedWords[associatedWords.length - 1].end_time),
                words: newWords
            });
        } else {
            // 没找到任何对应的 ASR 词位，直接使用 A 歌词原文保底显示
            finalLines.push({
                transcript: AText,
                start_time: a.start_time,
                end_time: a.end_time,
                words: [{ label: AText, start_time: a.start_time, end_time: a.end_time }]
            });
        }
    }

    return finalLines;
}
