import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

export interface Achievement {
  id: string;
  title: string;
  /** Shown once unlocked. */
  description: string;
  /** Hidden achievements show only as "Hidden achievement" until found. */
  hidden: boolean;
  /** Shown on locked entries so people know what they're hunting for. */
  difficulty: 'Easy' | 'Medium' | 'Hard' | 'Very hard';
}

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: 'freeze-frame',
    title: 'Freeze frame',
    description: 'Paused the readings to take a closer look.',
    hidden: true,
    difficulty: 'Easy',
  },
  {
    id: 'center-controlled',
    title: 'Consider this Center Controlled',
    description: 'Found the trophy tucked into the facts drawer.',
    hidden: true,
    difficulty: 'Easy',
  },
  {
    id: 'core-inspector',
    title: 'Core inspector',
    description: 'Read every single core in the core grid.',
    hidden: true,
    difficulty: 'Medium',
  },
  {
    id: 'odometer-rollover',
    title: 'Odometer rollover',
    description: 'Held the runtime odometer until it ran out of digits and wrapped back to zero.',
    hidden: true,
    difficulty: 'Medium',
  },
  {
    id: 'old-school',
    title: 'Old school',
    description: 'Entered the code everyone of a certain age knows by heart.',
    hidden: true,
    difficulty: 'Hard',
  },
  {
    id: 'pinpoint',
    title: 'Pinpoint',
    description: 'Tapped your own location on the spinning globe three times while it faced you.',
    hidden: true,
    difficulty: 'Very hard',
  },
  {
    id: 'dead-on',
    title: 'Dead on',
    description: 'Froze the odometer within a hundredth of a second of a whole second.',
    hidden: true,
    difficulty: 'Very hard',
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

  // The toast shows only on the first unlock, so everyday actions that also
  // earn an achievement (pausing) don't keep announcing it.
  const unlockedRef = useRef(unlocked);
  unlockedRef.current = unlocked;
  const unlock = useCallback((id: string) => {
    const a = ACHIEVEMENTS.find((x) => x.id === id);
    if (!a || unlockedRef.current.includes(id)) return;
    unlockedRef.current = [...unlockedRef.current, id];
    setUnlocked(unlockedRef.current);
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
