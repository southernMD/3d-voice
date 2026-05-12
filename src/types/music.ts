/**
 * 音乐与歌词相关的公共类型定义
 */

export interface WordRecord {
  label: string;
  start_time: number;
  end_time: number;
}

export interface UtteranceRecord {
  start_time: number;
  end_time: number;
  transcript: string;
  words: WordRecord[];
}

export interface ASRResultRecord {
  utterances: UtteranceRecord[];
  statusCode?: number;
  version?: string;
}

export interface EmotionScore {
  valence: number;
  arousal: number;
  tag: string;
}

export interface LyricEmotion {
  global: EmotionScore;
  segments: { 
    start: number; 
    end: number; 
    emotion: EmotionScore 
  }[];
}
