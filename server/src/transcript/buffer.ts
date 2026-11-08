import { MAX_WORDS_PER_EVENT, type Word } from '../events.js';

// About 20 minutes of speech: a word needed from early in a long call is still there.
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

  words(): Word[] {
    // Array.prototype.sort is stable, so equal start times keep arrival order.
    return [...this.finals, ...this.partial].sort((a, b) => a.startMs - b.startMs);
  }

  wordsSince(ms: number): Word[] {
    return this.words().filter((w) => w.startMs >= ms);
  }

  recentText(maxWords = 60): string {
    return this.words()
      .slice(-maxWords)
      .map((w) => w.text)
      .join(' ');
  }
}
