import type { Language } from '../events.js';

// What each language contributes to stall detection. Texts are matched lowercase, without
// punctuation or apostrophes and with Latin accents folded away ("cómo" is "como"), so write the
// patterns that way.
export interface Cues {
  // Hesitation sounds at the end of what was said.
  sounds: ReadonlySet<string>;
  // Words that start a noun phrase; one said twice is a search ("the the").
  determiners: ReadonlySet<string>;
  // "what is it called", "the thing": the word is on the tip of the tongue.
  filler: readonly RegExp[];
  // "the thing you...", "the place where...": a description in place of the word.
  describing: readonly RegExp[];
  // Short ordinary words that may be said twice or begin a longer one ("la lavadora"), so they
  // are not read as a stutter.
  smallWords: ReadonlySet<string>;
  // Words said twice for emphasis.
  emphasis: ReadonlySet<string>;
  // At the very end of speech these ask for a suggestion now.
  asks: readonly RegExp[];
}

const words = (list: string) => new Set(list.split(' '));

const NOT_A_STALL_AFTER_THING = 'is|was|are|were|about|here|there|has|had|will|would';

export const ENGLISH: Cues = {
  sounds: words('um uh er erm umm uhh hmm'),
  determiners: words('the a an my your his her our their'),
  filler: [
    /\bwhat(?:s| is| was)? (?:it|that) called\b/,
    /\bwhat (?:do )?you call (?:it|that|them)\b/,
    /\bwhat (?:its|it is) name\b/,
    /\bwhatchamacallit\b|\bwhatsit\b|\bthingamajig\b|\bthingy\b|\bthingummy\b/,
    new RegExp(`\\bthe (?:thing|stuff)(?! (?:${NOT_A_STALL_AFTER_THING})\\b)`),
    // "you know" as a stall ends the phrase; "do you know ..." or "you know what" do not.
    /(?<!\b(?:do|did|if|as|dont|would|how) )\byou know$/,
  ],
  describing: [
    /\bthe (?:thing|stuff) (?:you|i|for|to|where|which|with)\b/,
    /\bthe (?:place|man|person|woman|guy|lady|one|people) (?:who|where|that|which|you)\b/,
    /\bthe (?:\w+ )?one (?:you|that|who|where|with)\b/,
    /\bthe \w+ (?:we|you|i) use for\b/,
    /\bthe \w+ where (?:all|you|they|people)\b/,
    /\b\w+ thing (?:you|i|that)\b/,
    /\bits like (?:a|an|the)\b/,
  ],
  smallWords: words(
    'a i an the to in it is of on at so we he me my be do go no up or if as by can and but for you she his her our was are not that this with have they what',
  ),
  emphasis: words('very really much just well okay right yeah sorry'),
  asks: [/\b(?:whats|what is) the word(?: for)?$/],
};

// The other languages' cues are weak: a pause is still needed before they start a guess, they
// only say where the search for the word began. Only an explicit ask ("cómo se dice") acts at once.
const SPANISH: Cues = {
  sounds: words('eh em ehm mm mmm'),
  determiners: words('el la los las un una unos unas mi tu su'),
  filler: [/\b(?:el|la) (?:coso|cosa|cacharro|chisme)\b/, /\bcomo se (?:llama|dice)\b/],
  describing: [
    /\b(?:la|el) (?:cosa|coso|lugar|sitio|senor|persona|senora|tipo) (?:que|para|donde|de)\b/,
    /\bes como (?:un|una|el|la)\b/,
  ],
  smallWords: words(
    'el la lo los las un una de en y a o que se me te mi tu su por con al del es no si ya',
  ),
  emphasis: words('muy poco mucho nunca claro bueno vale'),
  asks: [
    /\b(?:como se (?:llama|dice)|cual es la palabra|como era la palabra)(?: para)?$/,
    /\bcomo se llama eso$/,
  ],
};

const FRENCH: Cues = {
  sounds: words('euh heu hum bah ben'),
  determiners: words('le la les un une des mon ma mes ton ta tes son sa ses'),
  filler: [/\ble (?:truc|machin|bidule|chose)\b/, /\bcomment (?:ca sappelle|on dit)\b/],
  describing: [
    /\b(?:le|la) (?:truc|machin|bidule|chose|endroit|monsieur|dame|type) (?:qui|que|pour|ou|avec)\b/,
    /\bcest comme (?:un|une|le|la)\b/,
  ],
  smallWords: words(
    'le la les un une de du des et en a au je tu il on ne pas que qui se me te ma mon ta ton sa son ce ca y',
  ),
  emphasis: words('tres bien vite toujours jamais vraiment'),
  asks: [
    /\b(?:comment (?:ca sappelle|on dit|dit on)|cest quoi le mot|quel est le mot)(?: pour)?$/,
    /\bcomment ca sappelle deja$/,
  ],
};

const GERMAN: Cues = {
  sounds: words('aeh aehm oeh oehm hm hmm'),
  determiners: words('der die das den dem ein eine einen einem mein meine dein deine sein seine'),
  filler: [
    /\b(?:das|der|die) (?:dings|dingsda|dingens)\b/,
    /\bdingsbums\b/,
    /\bwie heisst (?:das|es)\b/,
  ],
  describing: [
    /\b(?:das|der|die) (?:ding|dingens|ort|mann|frau|sache|teil) (?:das|der|die|wo|mit|fuer|zum|zur)\b/,
    /\bes ist wie (?:ein|eine|der|die|das)\b/,
  ],
  smallWords: words(
    'der die das den dem ein eine und zu in ist es ich du er wir sie nicht mit von auf an am im um so da ja',
  ),
  emphasis: words('sehr ganz echt gut schon doch'),
  asks: [
    /\b(?:wie (?:heisst|heist) (?:das|es|dieses|diese|dieser)(?: noch)?|wie sagt man|wie nennt man (?:das|es)|was ist das wort)(?: fuer)?$/,
  ],
};

// Devanagari is not folded; ़ is the nukta that some speech recognition writes after a letter.
const HINDI: Cues = {
  sounds: words('उम अं ऊं हम्म'),
  determiners: new Set<string>(),
  filler: [/वो चीज़?/, /क्या (?:कहते|बोलते) हैं/, /\bkya (?:kehte|bolte) hain\b/],
  describing: [
    /(?:वो|वह|वे) (?:चीज़?|जगह|आदमी|औरत|वाला|वाली) (?:जो|जहाँ|जहां|जिसमें|जिससे)/,
    /\bvo (?:cheez|jagah|aadmi) (?:jo|jahan)\b/,
  ],
  smallWords: words('है हैं का की के को से में और पर ने भी तो यह वह'),
  emphasis: words('बहुत बिल्कुल'),
  asks: [
    /(?:क्या (?:कहते|बोलते) हैं|क्या कहा जाता है|उसका नाम क्या है|इसे क्या कहते हैं)$/,
    /\b(?:kya (?:kehte|bolte) hain|ise kya kehte hain)$/,
  ],
};

const OTHERS: Record<Exclude<Language, 'en' | 'multi'>, Cues> = {
  es: SPANISH,
  fr: FRENCH,
  de: GERMAN,
  hi: HINDI,
};

export interface ActiveCues {
  // English cues start a guess after half a pause; the other languages' only after a whole one.
  strong: readonly Cues[];
  weak: readonly Cues[];
  // Everything below is the union over the languages in play.
  determiners: ReadonlySet<string>;
  smallWords: ReadonlySet<string>;
  emphasis: ReadonlySet<string>;
  asks: readonly RegExp[];
  // A single letter is a word in Spanish ("y", "o"), French ("a", "y") and German, so it only
  // counts as a stutter sound in English.
  loneLetterSounds: boolean;
}

const union = (sets: readonly ReadonlySet<string>[]) => new Set(sets.flatMap((s) => [...s]));

const CACHE = new Map<Language, ActiveCues>();

export function cuesFor(language: Language): ActiveCues {
  const cached = CACHE.get(language);
  if (cached) return cached;
  const strong = language === 'en' || language === 'multi' ? [ENGLISH] : [];
  const weak =
    language === 'en' ? [] : language === 'multi' ? Object.values(OTHERS) : [OTHERS[language]];
  const all = [...strong, ...weak];
  const active: ActiveCues = {
    strong,
    weak,
    determiners: union(all.map((c) => c.determiners)),
    smallWords: union(all.map((c) => c.smallWords)),
    emphasis: union(all.map((c) => c.emphasis)),
    asks: all.flatMap((c) => c.asks),
    loneLetterSounds: language === 'en',
  };
  CACHE.set(language, active);
  return active;
}

// "cómo" and "für" match as "como" and "fuer"; ß as "ss". Devanagari marks are left alone.
export const fold = (s: string): string =>
  s
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .normalize('NFC');
