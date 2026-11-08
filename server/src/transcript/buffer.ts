import { MAX_WORDS_PER_EVENT, type Word } from '../events.js';

// About 20 minutes of speech: a word needed from early in a long call is still there.
// Silence this long counts as a pause worth marking.
const PAUSE_MARK_MS = 800;

const MAX_FINAL_WORDS = 3000;

// In-memory only: the last finalised words plus the utterance still being spoken.
export class TranscriptBuffer {
  private finals: Word[] = [];
  private partial: Word[] = [];

  applyPartial(words: Word[]): void {
    this.partial = words.slice(-MAX_WORDS_PER_EVENT);
  }

  applyFinal(words: Word[]): void {
    this.finals = [...this.finals, ...words].slice(-MAX_FINAL_WORDS);
    this.partial = [];
  }

  clear(): void {
    this.finals = [];
    this.partial = [];
  }

  words(): Word[] {
    // Array.prototype.sort is stable, so equal start times keep arrival order.
    return [...this.finals, ...this.partial].sort((a, b) => a.startMs - b.startMs);
  }

  wordsSince(ms: number): Word[] {
    return this.words().filter((w) => w.startMs >= ms);
  }

  // The last words with a "…" wherever the speaker went quiet for a while between two words. A
  // recogniser sends no punctuation, so this is how the guesser can tell a description that
  // follows a stall from a finished sentence. There is no mark at the end: a trailing pause made
  // the guesser read every finished sentence as a search for a word.
  markedText(maxWords: number): string {
    const words = this.words().slice(-maxWords);
    const parts: string[] = [];
    words.forEach((w, i) => {
      const before = words[i - 1];
      if (before && w.startMs - before.endMs >= PAUSE_MARK_MS) parts.push('…');
      parts.push(w.text);
    });
    return parts.join(' ');
  }

  recentText(maxWords = 60): string {
    return this.words()
      .slice(-maxWords)
      .map((w) => w.text)
      .join(' ');
  }
}
