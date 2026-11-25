import type { RecentWord } from '../ui/recentWords';

// Pure helpers for the app window, so they can be tested without a page.

export function greeting(hour: number): string {
  if (hour < 5) return 'Hello';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

// "4:11 pm" in the user's own locale.
export const timeLabel = (at: number, locale?: string): string =>
  new Date(at).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });

export function wordStats(recent: RecentWord[]): { offered: number; used: number } {
  return { offered: recent.length, used: recent.filter((r) => r.accepted).length };
}

// The word to show in the hero: the last one taken, else the last one offered.
export const lastWord = (recent: RecentWord[]): RecentWord | undefined =>
  recent.find((r) => r.accepted) ?? recent[0];
