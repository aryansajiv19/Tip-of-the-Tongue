import { describe, expect, it } from 'vitest';
import type { Language, Word } from '../events.js';
import { detectStuck } from './detect.js';
import { disfluency } from './disfluency.js';
import { cuesFor, fold } from './languages.js';
import { endsWithAskForWord } from './manual.js';

const PAUSE_MS = 1500;
const say = (text: string): { words: Word[]; endMs: number } => {
  const words = text
    .split(/\s+/)
    .filter(Boolean)
    .map((t, i) => ({ text: t, startMs: i * 300, endMs: i * 300 + 100 }));
  return { words, endMs: words.at(-1)?.endMs ?? 0 };
};
const detect = (text: string, gap: number, language: Language) => {
  const { words, endMs } = say(text);
  return detectStuck(words, endMs + gap, { pauseMs: PAUSE_MS, language });
};
const asks = (text: string, language: Language) => endsWithAskForWord(say(text).words, language);

describe('fold', () => {
  it('drops Latin accents and spells umlauts and ß out, and leaves Devanagari alone', () => {
    expect(fold('cómo está mañana')).toBe('como esta manana');
    expect(fold('für schön, heißt')).toBe('fuer schoen, heisst');
    expect(fold('क्या कहते हैं')).toBe('क्या कहते हैं');
  });
});

describe('asking for the word in each language', () => {
  it.each([
    ['es', 'necesito el eh cómo se llama'],
    ['es', '¿Cuál es la palabra para?'],
    ['fr', "il me faut le truc, comment ça s'appelle"],
    ['fr', "c'est quoi le mot"],
    ['de', 'ich brauche das, wie heißt das'],
    ['de', 'wie sagt man'],
    ['hi', 'मुझे वो चाहिए, क्या कहते हैं'],
    ['hi', 'mujhe woh chahiye kya kehte hain'],
    ['multi', 'I need the, cómo se dice'],
    ['multi', "what's the word"],
  ] as const)('%s: "%s"', (language, text) => expect(asks(text, language)).toBe(true));

  it.each([
    ['es', 'no sé cómo se llama mi hermano pero vive aquí'],
    ['fr', 'comment on dit bonjour à mon ami'],
    ['de', 'ich weiß wie das heißt aber nicht warum'],
    ['hi', 'क्या कहते हैं वो लोग मुझसे'],
    ['es', "what's the word"],
    ['en', 'cómo se dice'],
  ] as const)('not %s: "%s"', (language, text) => expect(asks(text, language)).toBe(false));
});

describe('cues in another language are weak', () => {
  const cue = 'necesito la cosa que sirve para';

  it('do not start a guess after half a pause', () => {
    expect(detect(cue, PAUSE_MS / 2, 'es')).toEqual({ stuck: false });
  });

  it('after a whole pause the search is dated from the cue, not from the last word', () => {
    const r = detect(cue, PAUSE_MS + 200, 'es');
    const { words } = say(cue);
    expect(r.stuck && r.reason).toBe('pause');
    // "la cosa que" starts at the third word; the cue ends at its end
    expect(r.stuck && r.sinceMs).toBeLessThan((words.at(-1)?.startMs ?? 0) - 1);
  });

  it('English cues are not looked for in a Spanish conversation', () => {
    expect(detect('I need the thing you use for', PAUSE_MS / 2, 'es')).toEqual({ stuck: false });
  });

  it('English speech keeps its strong cues', () => {
    expect(detect('I need the thing you use for', PAUSE_MS / 2, 'en').stuck).toBe(true);
  });

  it('multi has the English cues strong and the others weak', () => {
    expect(detect('I need the thing you use for', PAUSE_MS / 2, 'multi').stuck).toBe(true);
    expect(detect(cue, PAUSE_MS / 2, 'multi')).toEqual({ stuck: false });
    expect(detect('mujhe woh chahiye वो चीज़ जो', PAUSE_MS + 200, 'multi').stuck).toBe(true);
  });

  it.each([
    ['es', 'necesito el cacharro eh'],
    ['fr', 'il me faut le truc euh'],
    ['de', 'ich brauche das dings äh'],
    ['hi', 'मुझे वो चीज़ जो'],
  ] as const)('%s: a pause after a cue is a stall', (language, text) => {
    expect(detect(text, PAUSE_MS + 200, language).stuck).toBe(true);
  });
});

describe('stutter detection is not English-only', () => {
  it('does not read Spanish short words as a stutter: "la lavadora", "y yo"', () => {
    const es = cuesFor('es');
    expect(disfluency(say('pon la lavadora y yo lavo').words, 5000, es).events).toBe(0);
    expect(disfluency(say('es un ungüento para el elefante').words, 5000, es).events).toBe(0);
  });

  it('a lone letter is a stutter sound only in English', () => {
    expect(disfluency(say('a c coffee').words, 5000, cuesFor('en')).events).toBe(1);
    expect(disfluency(say('café y yogur').words, 5000, cuesFor('es')).events).toBe(0);
  });

  it('sees a held sound and a repeated start in accented text', () => {
    const de = cuesFor('de');
    expect(disfluency(say('ich möchte ä-ä-äpfel').words, 5000, de).events).toBe(1);
    expect(disfluency(say('ich möchte ööö').words, 5000, de).atEnd).toBe(true);
  });

  it('does not count emphasis in the chosen language', () => {
    expect(disfluency(say('es muy muy bueno').words, 5000, cuesFor('es')).events).toBe(0);
    expect(disfluency(say('es ist sehr sehr gut').words, 5000, cuesFor('de')).events).toBe(0);
  });

  it('keeps Devanagari words whole', () => {
    const { words, endMs } = say('मुझे क्या कहते हैं');
    expect(detectStuck(words, endMs + 3000, { pauseMs: PAUSE_MS, language: 'hi' }).stuck).toBe(
      true,
    );
  });
});
