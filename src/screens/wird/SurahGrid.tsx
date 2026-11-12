import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ProgressBar, cx } from '@/components/ui';
import { formatPages, TOTAL_PAGES } from '@/engine/pages';
import { allSurahStats, cellState, memorizedPages, overall, type CellState } from '@/engine/progress';
import { surahMeta } from '@/engine/quran';
import { haptic } from '@/lib/haptics';
import { useToday } from '@/lib/hooks';
import { useWird } from '@/store/useWird';

/** Code couleur unique des 114 sourates (Accueil, Mon Wird, Progression). */
export const CELL_BG: Record<CellState, string> = {
  learned: 'bg-good',
  learning: 'bg-blue',
  reinforce: 'bg-hard',
  none: 'bg-neutral',
};
export const CELL_LABEL: Record<CellState, string> = { learned: 'Apprise', learning: 'En cours', reinforce: 'À renforcer', none: 'Non commencée' };

/** Tableau des 114 sourates : une case numérotée par sourate, colorée selon son état réel. */
export function SurahGrid() {
  const today = useToday();
  const verses = useWird((s) => s.verses);
  const stats = useMemo(() => allSurahStats(verses, today), [verses, today]);
  const o = useMemo(() => overall(verses, today), [verses, today]);
  const pages = useMemo(() => memorizedPages(verses), [verses]);
  const counts = useMemo(() => {
    const c: Record<CellState, number> = { learned: 0, learning: 0, reinforce: 0, none: 0 };
    stats.forEach((s) => c[cellState(s)]++);
    return c;
  }, [stats]);
  const pct = o.ratio === 0 ? '0' : o.ratio < 0.01 ? '<1' : String(Math.round(o.ratio * 100));
  return (
    <div className="card p-4" aria-label="Les 114 sourates">
      <div className="flex items-end justify-between">
        <p className="font-display text-[32px] font-semibold leading-none tabular-nums">{pct}<span className="text-xl text-muted">%</span> <span className="font-sans text-sm font-normal text-muted">du Coran</span></p>
        <p className="text-right text-xs text-muted">≈ {formatPages(pages)}<br />sur {TOTAL_PAGES} pages</p>
      </div>
      <ProgressBar value={pages / TOTAL_PAGES} className="mt-3" />
      <ol className="mt-4 grid grid-cols-[repeat(10,1fr)] gap-[3px]">
        {stats.map((st) => {
          const state = cellState(st);
          return (
            <li key={st.surah}>
              <Link
                to={`/wird/${st.surah}`}
                onClick={() => haptic('tap')}
                aria-label={`Sourate ${st.surah}, ${surahMeta(st.surah).tr} : ${CELL_LABEL[state].toLowerCase()}`}
                className={cx('flex aspect-square items-center justify-center rounded-[6px] text-[11px] font-semibold tabular-nums transition active:scale-90', CELL_BG[state], state === 'none' ? 'text-neutral-ink' : 'text-white')}
              >
                {st.surah}
              </Link>
            </li>
          );
        })}
      </ol>
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[13px]" aria-label="Légende">
        {(['learned', 'learning', 'reinforce', 'none'] as CellState[]).map((k) => (
          <li key={k} className="flex items-center gap-2"><i className={cx('h-[11px] w-[11px] rounded-[3px]', CELL_BG[k])} /><span className="text-muted">{CELL_LABEL[k]}</span><b className="ml-auto tabular-nums">{counts[k]}</b></li>
        ))}
      </ul>
    </div>
  );
}
