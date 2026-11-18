import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { pageRange } from '@/engine/pages';
import { verseKind } from '@/engine/progress';
import { ayahId, fromAyahId, surahMeta } from '@/engine/quran';
import { haptic } from '@/lib/haptics';
import { basmalaFor } from '@/lib/quranText';
import { tajweedParts } from '@/lib/tajweed';
import { useReaderData } from '@/lib/useReaderData';
import { useWird } from '@/store/useWird';
import { PageReader } from './PageReader';
import { VerseSheet } from './VerseSheet';
import { cx } from './ui';

const BORDER: Record<string, string> = { n: 'border-neutral', l: 'border-blue', m: 'border-good', r: 'border-hard' };

interface ReaderProps {
  page: number;
  onPage: (p: number) => void;
  onSurah: (s: number) => void;
  surah: number | null;
  mode: 'page' | 'list';
  onMode: (m: 'page' | 'list') => void;
  highlight?: { surah: number; from: number; to: number } | null;
  onClose?: () => void;
}

/**
 * Coran numérique, sans distraction (ni notification, ni évaluation), texte Tanzil Uthmani Minimal :
 *  - « Pages » : lecteur plein écran du Mushaf de Médine (604 pages), voir PageReader ;
 *  - « Liste » : une sourate verset par verset, avec la traduction française.
 * Toucher un verset ouvre sa fiche.
 */
export function Reader(props: ReaderProps) {
  if (props.mode === 'page') return <PageReader page={props.page} onPage={props.onPage} onMode={props.onMode} onClose={props.onClose ?? (() => history.back())} highlight={props.highlight} />;
  return <ListReader {...props} />;
}

function ListReader({ page, onSurah, surah, onMode, highlight }: ReaderProps) {
  const verses = useWird((s) => s.verses);
  const { data, failed, tj, fr, tjOn, toggleTj, size, zoom } = useReaderData();
  const [sel, setSel] = useState<{ surah: number; ayah: number } | null>(null);
  const colored = (s: number, a: number, text: string) =>
    tj && tjOn ? tajweedParts(text, tj.spans[`${s}:${a}`], tj.families).map(([t, f], i) => (f ? <span key={i} className={`tj-${f}`}>{t}</span> : t)) : text;
  const inHl = (s: number, a: number) => !!highlight && highlight.surah === s && a >= highlight.from && a <= highlight.to;

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5" role="tablist">
          <button role="tab" aria-selected={false} className="chip chip-sm" onClick={() => onMode('page')}>Pages</button>
          <button role="tab" aria-selected className="chip chip-sm">Liste</button>
        </div>
        <div className="flex items-center gap-1.5">
          <button className="chip chip-sm" aria-pressed={tjOn} onClick={toggleTj}>Tajwid</button>
          <button className="chip chip-sm" onClick={() => zoom(-0.15)} aria-label="Réduire le texte">A−</button>
          <button className="chip chip-sm" onClick={() => zoom(0.15)} aria-label="Agrandir le texte">A+</button>
        </div>
      </div>

      {failed && <p className="card mt-4 p-4 text-sm text-muted">Le texte n’a pas pu être chargé. Réessaie une fois connecté.</p>}
      {!data && !failed && <p className="mt-6 text-center text-sm text-muted">Chargement…</p>}

      {data && (() => {
        const s = surah ?? fromAyahId(pageRange(Math.max(1, page))[0]).surah;
        const meta = surahMeta(s);
        const bas = basmalaFor(data, s);
        return (
          <div className="mt-3">
            <h2 className="font-display text-[22px] font-semibold">{meta.id}. {meta.tr} <span className="ar ml-1 text-[22px] font-normal" lang="ar">{meta.ar}</span></h2>
            {bas && <p className="ar my-3 border-b border-line pb-3 text-center font-bold leading-[2]" style={{ fontSize: `${28 * size}px` }} lang="ar">{bas}</p>}
            <div className="space-y-2.5">
              {data.s[s - 1].map((t, i) => {
                const a = i + 1;
                const k = verseKind(verses[ayahId(s, a)]);
                return (
                  <button key={a} id={`v${a}`} onClick={() => { haptic('tap'); setSel({ surah: s, ayah: a }); }} className={cx('block w-full rounded-[10px] border border-line border-r-[5px] bg-surface px-3 py-1.5 text-right', BORDER[k], inHl(s, a) && 'ring-2 ring-primary/30')}>
                    <span className="ar block leading-[2.3]" style={{ fontSize: `${24 * size}px` }} lang="ar">{colored(s, a, t)}</span>
                    {fr && <span className="mt-1 block border-t border-line/70 pt-1.5 text-left text-[14px] leading-snug text-ink/80">{fr.s[s - 1][a - 1]}</span>}
                    <span className="mt-1 block text-left text-xs text-muted">Verset {a}</span>
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex gap-2.5">
              <button className="btn-outline flex-1" disabled={s <= 1} onClick={() => onSurah(s - 1)}><ChevronLeft size={18} /> Sourate précédente</button>
              <button className="btn-outline flex-1" disabled={s >= 114} onClick={() => onSurah(s + 1)}>Suivante <ChevronRight size={18} /></button>
            </div>
          </div>
        );
      })()}

      {sel && <VerseSheet surah={sel.surah} ayah={sel.ayah} onClose={() => setSel(null)} />}
    </div>
  );
}
