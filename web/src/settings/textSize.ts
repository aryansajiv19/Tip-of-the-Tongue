// Normal or Large text, kept on this device. Large scales every text size in the overlay.
export const TEXT_SIZES = ['normal', 'large'] as const;
export type TextSize = (typeof TEXT_SIZES)[number];

export const TEXT_SIZE_LABELS: Record<TextSize, string> = { normal: 'Normal', large: 'Large' };

const STORAGE_KEY = 'tott.textSize';

export const isTextSize = (v: unknown): v is TextSize => v === 'normal' || v === 'large';

export function savedTextSize(): TextSize {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return isTextSize(v) ? v : 'normal';
  } catch {
    return 'normal';
  }
}

// Sets the size on the page (CSS reads data-text-size) and keeps it.
export function applyTextSize(size: TextSize, save = true): void {
  document.documentElement.dataset.textSize = size;
  if (!save) return;
  try {
    localStorage.setItem(STORAGE_KEY, size);
  } catch {
    // Private mode: the choice still works for this visit.
  }
}
