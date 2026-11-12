import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ProgressBar, cx } from '@/components/ui';
import { formatPages, TOTAL_PAGES } from '@/engine/pages';
import { allSurahStats, cellState, memorizedPages, overall, type CellState } from '@/engine/progress';
import { surahMeta } from '@/engine/quran';
import { useToday } from '@/lib/hooks';
import { useWird } from '@/store/useWird';

export const CELL_BG: Record<CellState, string> = {
  learned: 'bg-good',
  learning: 'bg-blue',
  reinforce: 'bg-hard',
  none: 'bg-line/70',
};
const LABEL: Record<CellState, string> = { learned: 'Apprise', learning: 'En cours d’apprentissage', reinforce: 'À renforcer', none: 'Non commencée' };

/** Tableau des 114 sourates : une case par sourate, colorée selon son état réel dans les données. */
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
    <div>
      <section className="rounded-xl border border-line bg-surface p-4" aria-label="Progression globale">
        <div className="flex items-end justify-between">
          <div>
            <p className="label">Progression globale</p>
            <p className="mt-1.5 font-display text-[34px] font-semibold leading-none tabular-nums">{pct}<span className="text-xl text-muted">%</span> <span className="text-sm font-normal text-muted">du Coran</span></p>
          </div>
          <p className="pb-0.5 text-right text-xs text-muted">≈ {formatPages(pages)}<br />sur {TOTAL_PAGES} pages</p>
        </div>
        <ProgressBar value={pages / TOTAL_PAGES} tone="gold" className="mt-3" />
      </section>

      <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]" aria-label="Légende">
        {(['learned', 'learning', 'reinforce', 'none'] as CellState[]).map((k) => (
          <li key={k} className="flex items-center gap-2">
            <i className={cx('h-3.5 w-3.5 rounded', CELL_BG[k])} />
            <span className="text-muted">{LABEL[k]}</span>
            <b className="ml-auto tabular-nums">{counts[k]}</b>
          </li>
        ))}
      </ul>

      <ol className="mt-5 grid grid-cols-6 gap-1.5 sm:grid-cols-8 lg:grid-cols-10">
        {stats.map((st) => {
          const state = cellState(st);
          const meta = surahMeta(st.surah);
          const ratio = st.total ? (st.memorized + st.learning * 0.5) / st.total : 0;
          return (
            <li key={st.surah}>
              <Link
                to={`/wird/sourates/${st.surah}`}
                aria-label={`Sourate ${st.surah}, ${meta.tr} : ${LABEL[state].toLowerCase()}`}
                className={cx('relative flex aspect-[1/1.1] flex-col items-center justify-center overflow-hidden rounded-lg transition active:scale-95', CELL_BG[state], state === 'none' ? 'text-ink' : 'text-white')}
              >
                <span className="font-display text-[17px] font-semibold leading-none tabular-nums">{st.surah}</span>
                <span className="ar mt-1 max-w-full truncate px-0.5 text-[13px] leading-none opacity-90" lang="ar">{meta.ar}</span>
                {state === 'learning' && <span className="absolute inset-x-0 bottom-0 h-[3px] bg-white/30"><span className="block h-full bg-white" style={{ width: `${ratio * 100}%` }} /></span>}
              </Link>
            </li>
          );
        })}
      </ol>
      <p className="mt-4 text-xs leading-relaxed text-muted">Les couleurs reflètent l’état réel de chaque sourate : orange dès qu’un verset appris est dans le circuit de renforcement ; vert quand tous les versets sont appris sans fragilité ; bleu pour un apprentissage ou une mémorisation partielle.</p>
    </div>
  );
}
