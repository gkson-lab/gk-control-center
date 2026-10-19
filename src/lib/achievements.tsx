import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

export interface Achievement {
  id: string;
  title: string;
  /** Shown once unlocked. */
  description: string;
  /** Hidden achievements show only as "Hidden achievement" until found. */
  hidden: boolean;
}

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: 'center-controlled',
    title: 'Consider this Center Controlled',
    description: 'Found the trophy tucked into the facts drawer.',
    hidden: true,
  },
  {
    id: 'odometer-rollover',
    title: 'Odometer rollover',
    description: 'Held the runtime odometer until it ran out of digits and wrapped back to zero.',
    hidden: true,
  },
];

const KEY = 'gkcc.achievements';

function readUnlocked(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

interface AchievementsApi {
  unlocked: string[];
  unlock: (id: string) => void;
  /** The achievement whose toast is showing, if any. */
  toast: Achievement | null;
  dismissToast: () => void;
}

const Ctx = createContext<AchievementsApi | null>(null);

export function AchievementsProvider({ children }: { children: ReactNode }) {
  const [unlocked, setUnlocked] = useState<string[]>(readUnlocked);
  const [toast, setToast] = useState<Achievement | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(unlocked));
    } catch {
      /* kept for this session only */
    }
  }, [unlocked]);

  const dismissToast = useCallback(() => {
    window.clearTimeout(timer.current);
    setToast(null);
  }, []);

  // Unlocking again still shows the toast: finding a secret twice should
  // still feel like something happened.
  const unlock = useCallback((id: string) => {
    const a = ACHIEVEMENTS.find((x) => x.id === id);
    if (!a) return;
    setUnlocked((u) => (u.includes(id) ? u : [...u, id]));
    setToast(a);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), 5200);
  }, []);

  return <Ctx.Provider value={{ unlocked, unlock, toast, dismissToast }}>{children}</Ctx.Provider>;
}

export function useAchievements(): AchievementsApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAchievements needs AchievementsProvider');
  return v;
}
