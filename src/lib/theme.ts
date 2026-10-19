import { useEffect, useState } from 'react';

export type ThemeChoice = 'system' | 'light' | 'dark';
const KEY = 'gkcc.theme';

function readChoice(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    /* storage unavailable: fall back to the system theme */
  }
  return 'system';
}

/** System / Light / Dark, remembered on this device (DESIGN.md, themes). */
export function useTheme() {
  const [choice, setChoice] = useState<ThemeChoice>(readChoice);

  useEffect(() => {
    const root = document.documentElement;
    if (choice === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', choice);
    try {
      localStorage.setItem(KEY, choice);
    } catch {
      /* not remembered, still applied */
    }
  }, [choice]);

  return { choice, setChoice };
}
