import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { TOTAL_PAGES, pageRange } from '@/engine/pages';
import { verseKind } from '@/engine/progress';
import { ayahId, fromAyahId, surahMeta } from '@/engine/quran';
import { haptic } from '@/lib/haptics';
import { basmalaFor, loadQuranText, type QuranData } from '@/lib/quranText';
import { useWird } from '@/store/useWird';
import { VerseSheet } from './VerseSheet';
import { cx } from './ui';

const SIZE_KEY = 'wird-reader-size';
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const arNum = (n: number) => String(n).replace(/\d/g, (d) => AR_DIGITS[+d]);
const BORDER: Record<string, string> = { n: 'border-neutral', l: 'border-blue', m: 'border-good', r: 'border-hard' };

/**
 * Coran numérique : lecture par pages du Mushaf de Médine (604) ou par sourate, texte Tanzil Uthmani Minimal, sans
 * distraction (ni notification, ni évaluation). Toucher un verset ouvre sa fiche. Aucun audio, tajwid ni traduction.
 */
export function Reader({ page, onPage, onSurah, surah, mode, onMode, highlight }: { page: number; onPage: (p: number) => void; onSurah: (s: number) => void; surah: number | null; mode: 'page' | 'list'; onMode: (m: 'page' | 'list') => void; highlight?: { surah: number; from: number; to: number } | null }) {
  const verses = useWird((s) => s.verses);
  const [data, setData] = useState<QuranData | null>(null);
  const [failed, setFailed] = useState(false);
  const [sel, setSel] = useState<{ surah: number; ayah: number } | null>(null);
  const [size, setSize] = useState(() => {
    try { return Number(localStorage.getItem(SIZE_KEY)) || 1; } catch { return 1; }
  });
  const [goto, setGoto] = useState('');
  useEffect(() => {
    void loadQuranText().then((d) => (d ? setData(d) : setFailed(true)));
  }, []);
  const zoom = (d: number) => {
    const n = Math.max(0.8, Math.min(2, Math.round((size + d) * 100) / 100));
    setSize(n);
    try { localStorage.setItem(SIZE_KEY, String(n)); } catch { /* ignore */ }
  };

  const pg = Math.max(1, Math.min(TOTAL_PAGES, page));
  const groups = useMemo(() => {
    if (mode !== 'page') return [];
    const [a, b] = pageRange(pg);
    const out: { surah: number; ayahs: number[] }[] = [];
    for (let id = a; id <= b; id++) {
      const { surah: s, ayah } = fromAyahId(id);
      const g = out[out.length - 1];
      if (g && g.surah === s) g.ayahs.push(ayah);
      else out.push({ surah: s, ayahs: [ayah] });
    }
    return out;
  }, [mode, pg]);
  const inHl = (s: number, a: number) => !!highlight && highlight.surah === s && a >= highlight.from && a <= highlight.to;
  const style = { fontSize: `${28 * size}px` } as React.CSSProperties;

  const verseSpan = (s: number, a: number) => (
    <span key={a}>
      <span onClick={() => { haptic('tap'); setSel({ surah: s, ayah: a }); }} className={cx('cursor-pointer rounded-md', inHl(s, a) && 'bg-primary/15')}>{data!.s[s - 1][a - 1]}</span>{' '}
      <span className="vm">{arNum(a)}</span>{' '}
    </span>
  );

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-2" role="tablist">
          <button role="tab" aria-selected={mode === 'page'} className="chip" onClick={() => onMode('page')}>Pages</button>
          <button role="tab" aria-selected={mode === 'list'} className="chip" onClick={() => onMode('list')}>Liste</button>
        </div>
        <div className="flex gap-1.5">
          <button className="btn-soft !min-h-[36px] !px-3 text-sm" onClick={() => zoom(-0.15)} aria-label="Réduire le texte">A−</button>
          <button className="btn-soft !min-h-[36px] !px-3 text-sm" onClick={() => zoom(0.15)} aria-label="Agrandir le texte">A+</button>
        </div>
      </div>

      {failed && <p className="card mt-4 p-4 text-sm text-muted">Le texte n’a pas pu être chargé. Réessaie une fois connecté.</p>}
      {!data && !failed && <p className="mt-6 text-center text-sm text-muted">Chargement…</p>}

      {data && mode === 'page' && (
        <>
          <p className="my-3 text-center text-sm text-muted">Page {pg} / {TOTAL_PAGES}</p>
          <div className="rounded-[18px] border border-line bg-surface px-3 pb-3 pt-3.5 shadow-[0_2px_14px_rgba(31,77,58,.06)]" key={pg}>
            {groups.map((g) => {
              const meta = surahMeta(g.surah);
              const first = g.ayahs[0] === 1;
              const bas = first ? basmalaFor(data, g.surah) : null;
              return (
                <div key={`${g.surah}-${g.ayahs[0]}`}>
                  {first && (
                    <div className="card mb-2 mt-1 py-2 text-center">
                      <p className="ar text-[22px] leading-tight" lang="ar">{meta.ar}</p>
                      <p className="text-xs text-muted">{meta.id}. {meta.tr}</p>
                    </div>
                  )}
                  {bas && <p className="ar mb-3 border-b border-line pb-3 text-center font-bold leading-[2]" style={style} lang="ar">{bas}</p>}
                  <p className="ar text-justify leading-[2.25] [text-align-last:center]" style={style} lang="ar">{g.ayahs.map((a) => verseSpan(g.surah, a))}</p>
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex items-center justify-between text-[13px] text-muted">
            <span>Page {pg}</span>
            <span className="ar text-[15px] leading-snug" lang="ar">الصفحة {arNum(pg)}</span>
          </div>
          <div className="mt-3 flex gap-2.5">
            <button className="btn-outline flex-1" disabled={pg <= 1} onClick={() => { haptic('select'); onPage(pg - 1); }}><ChevronLeft size={18} /> Précédente</button>
            <button className="btn-outline flex-1" disabled={pg >= TOTAL_PAGES} onClick={() => { haptic('select'); onPage(pg + 1); }}>Suivante <ChevronRight size={18} /></button>
          </div>
          <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); const n = parseInt(goto); if (n >= 1 && n <= TOTAL_PAGES) { onPage(n); setGoto(''); } }}>
            <input className="input" inputMode="numeric" placeholder="N° de page (1–604)" value={goto} onChange={(e) => setGoto(e.target.value.replace(/\D/g, ''))} aria-label="Aller à la page" />
            <button className="btn-primary !px-5" type="submit">Aller</button>
          </form>
        </>
      )}

      {data && mode === 'list' && (() => {
        const s = surah ?? fromAyahId(pageRange(pg)[0]).surah;
        const meta = surahMeta(s);
        const bas = basmalaFor(data, s);
        return (
          <div className="mt-3">
            <h2 className="font-display text-[22px] font-semibold">{meta.id}. {meta.tr} <span className="ar ml-1 text-[22px] font-normal" lang="ar">{meta.ar}</span></h2>
            {bas && <p className="ar my-3 border-b border-line pb-3 text-center font-bold leading-[2]" style={style} lang="ar">{bas}</p>}
            <div className="space-y-2.5">
              {data.s[s - 1].map((t, i) => {
                const a = i + 1;
                const k = verseKind(verses[ayahId(s, a)]);
                return (
                  <button key={a} id={`v${a}`} onClick={() => { haptic('tap'); setSel({ surah: s, ayah: a }); }} className={cx('block w-full rounded-[10px] border border-line border-r-[5px] bg-surface px-3 py-1.5 text-right', BORDER[k], inHl(s, a) && 'ring-2 ring-primary/30')}>
                    <span className="ar block leading-[2.3]" style={{ fontSize: `${24 * size}px` }} lang="ar">{t}</span>
                    <span className="block text-left text-xs text-muted">Verset {a}</span>
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

      <p className="mt-5 text-xs leading-relaxed text-muted">Texte et pagination : Projet Tanzil (<a className="underline" href="https://tanzil.net" target="_blank" rel="noreferrer">tanzil.net</a>), CC BY 3.0, copie non modifiée. Touche un verset pour voir sa fiche.</p>
      {sel && <VerseSheet surah={sel.surah} ayah={sel.ayah} onClose={() => setSel(null)} />}
    </div>
  );
}
