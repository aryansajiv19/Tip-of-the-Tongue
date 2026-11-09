import { LANGUAGES, type Language } from '../../../server/src/events';

// What the user speaks. Names are in the language itself, so a speaker can find theirs.
export const LANGUAGE_OPTIONS = [
  { code: 'en', name: 'English' },
  { code: 'multi', name: 'Mixed languages' },
  { code: 'es', name: 'Español' },
  { code: 'fr', name: 'Français' },
  { code: 'de', name: 'Deutsch' },
  { code: 'hi', name: 'हिन्दी' },
] satisfies { code: Language; name: string }[];

export const MIXED_HINT = 'Use when you switch between languages mid-sentence';

const STORAGE_KEY = 'tott.language';

export const isLanguage = (v: unknown): v is Language =>
  typeof v === 'string' && (LANGUAGES as readonly string[]).includes(v);

// The saved choice, or null if never chosen (then nothing is sent and the defaults apply).
export function savedLanguage(): Language | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return isLanguage(v) ? v : null;
  } catch {
    return null;
  }
}

export function saveLanguage(value: Language): void {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Private mode: the choice still works for this visit.
  }
}

const BCP47: Record<Exclude<Language, 'multi'>, string> = {
  en: 'en-US',
  es: 'es-ES',
  fr: 'fr-FR',
  de: 'de-DE',
  hi: 'hi-IN',
};

// The tag the browser's own speech recognition needs. Mixed languages and "not chosen" use the
// browser's language (undefined lets useSpeech fall back to it too).
export function speechLang(language: Language | null, browserLanguage: string): string | undefined {
  if (language === null) return undefined;
  return language === 'multi' ? browserLanguage || undefined : BCP47[language];
}
