import { useEffect, useState } from 'react';

/** Rows of the Overview's "Right now" list, in display order. */
export type RowId = 'memory' | 'graphics' | 'disk' | 'network';
/** Parts of the Overview that can be switched off. */
export type PartId = 'processor' | 'trail' | 'rows' | 'runtime';

export interface Layout {
  rows: RowId[];
  hiddenRows: RowId[];
  hiddenParts: PartId[];
}

export const DEFAULT_LAYOUT: Layout = {
  rows: ['memory', 'graphics', 'disk', 'network'],
  hiddenRows: [],
  hiddenParts: [],
};

const KEY = 'gkcc.layout';
const ALL_ROWS: RowId[] = DEFAULT_LAYOUT.rows;

function read(): Layout {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (!v || !Array.isArray(v.rows)) return DEFAULT_LAYOUT;
    // Keep only known rows, and add any new ones a later version introduced.
    const rows = (v.rows as RowId[]).filter((r) => ALL_ROWS.includes(r));
    for (const r of ALL_ROWS) if (!rows.includes(r)) rows.push(r);
    return {
      rows,
      hiddenRows: Array.isArray(v.hiddenRows) ? v.hiddenRows.filter((r: RowId) => ALL_ROWS.includes(r)) : [],
      hiddenParts: Array.isArray(v.hiddenParts) ? v.hiddenParts : [],
    };
  } catch {
    return DEFAULT_LAYOUT;
  }
}

/** Custom layout pack: the Overview's arrangement, remembered on this device. */
export function useLayout() {
  const [layout, setLayout] = useState<Layout>(read);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(layout));
    } catch {
      /* kept for this session only */
    }
  }, [layout]);
  return { layout, setLayout };
}

export function moveRow(l: Layout, id: RowId, to: number): Layout {
  const rows = l.rows.filter((r) => r !== id);
  rows.splice(Math.max(0, Math.min(rows.length, to)), 0, id);
  return { ...l, rows };
}

export function toggle<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}
