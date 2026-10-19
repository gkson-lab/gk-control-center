import { Dialog } from './Dialog';
import { TrophyMark } from './AchievementToast';
import { ACHIEVEMENTS, useAchievements } from '../lib/achievements';
import { int } from '../lib/format';
import type { LiveMetrics } from '../lib/types';

interface FactsDrawerProps {
  open: boolean;
  onClose: () => void;
  m: LiveMetrics;
  diskOpsTotal: number;
}

/** The "made with ♥ by gkson" drawer: live fun facts and the achievements list. */
export function FactsDrawer({ open, onClose, m, diskOpsTotal }: FactsDrawerProps) {
  const { unlocked, unlock } = useAchievements();
  const bytesStored = Math.round(m.disks.reduce((a, d) => a + d.used_gb, 0) * 1024 ** 3);
  const found = ACHIEVEMENTS.filter((a) => unlocked.includes(a.id)).length;

  return (
    <Dialog open={open} onClose={onClose} title="Fun facts" placement="left">
      <div className="grid gap-5">
        <Fact label="Bytes stored on your drives" value={bytesStored.toLocaleString()} />
        <Fact label="Disk operations since GKCC opened" value={int(diskOpsTotal)} />
        <Fact label="Hours of runtime this session" value={(m.odometer_total / 3600).toFixed(2)} />
        <div className="grid grid-cols-2 gap-4 border-t border-line pt-5">
          <Fact label="Logical processors" value={String(m.logical_cores)} small />
          <Fact label="Processes running" value={int(m.processes)} small />
        </div>
      </div>

      <section aria-label="Achievements" className="mt-8 border-t border-line pt-5">
        <div className="mb-3 flex items-baseline justify-between">
          <h3 className="type-display m-0 text-base">Achievements</h3>
          <span className="type-condensed text-sm text-muted">
            {found} of {ACHIEVEMENTS.length} found
          </span>
        </div>
        <ul className="m-0 grid list-none gap-3 p-0">
          {ACHIEVEMENTS.map((a) => {
            const got = unlocked.includes(a.id);
            return (
              <li key={a.id} className="flex items-center gap-3">
                <TrophyMark muted={!got} />
                <span>
                  <span className="block text-[15px] font-semibold">{got || !a.hidden ? a.title : 'Hidden achievement'}</span>
                  <span className="type-condensed block text-sm text-muted">{got ? a.description : 'Somewhere in GK Control Center.'}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {/* The original hidden achievement: a quiet trophy at the foot of the drawer. */}
      <div className="mt-10 flex">
        <button
          type="button"
          aria-label="Trophy"
          onClick={() => unlock('center-controlled')}
          className="flex h-11 w-11 items-center justify-center rounded-control border border-line text-tick transition-transform hover:scale-110 hover:text-muted"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden>
            <path d="M7 4h10v5a5 5 0 0 1-10 0V4z" />
            <path d="M12 14v3.5M8.5 20h7l-1-2.5h-5z" />
          </svg>
        </button>
      </div>
    </Dialog>
  );
}

function Fact({ label, value, small = false }: { label: string; value: string; small?: boolean }) {
  return (
    <div>
      <p className={`type-reading m-0 break-all leading-tight ${small ? 'text-xl' : 'text-[1.6rem]'}`}>{value}</p>
      <p className="type-condensed m-0 mt-1 text-sm text-muted">{label}</p>
    </div>
  );
}
