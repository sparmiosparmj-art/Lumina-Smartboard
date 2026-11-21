export type SpeechWordRange = {
  start: number;
  end: number;
};

const SPEECH_WORD_PATTERN = /[\p{L}\p{M}\p{N}]+(?:['’][\p{L}\p{M}\p{N}]+)*/gu;

export function getSpeechWordRanges(text: string): SpeechWordRange[] {
  const words: SpeechWordRange[] = [];
  for (const match of text.matchAll(SPEECH_WORD_PATTERN)) {
    const start = match.index;
    words.push({ start, end: start + match[0].length });
  }
  return words;
}

export function getActiveSpeechWordIndex(
  words: SpeechWordRange[],
  currentTime: number,
  duration: number,
): number {
  if (words.length === 0 || !Number.isFinite(currentTime) || !Number.isFinite(duration) || duration <= 0) return -1;
  const finalChar = words[words.length - 1].end;
  const targetChar = Math.max(0, Math.min(1, currentTime / duration)) * finalChar;
  const index = words.findIndex((word) => targetChar < word.end);
  return index < 0 ? words.length - 1 : index;
}
