import { AlignJustify, BookOpen, ChevronLeft, ChevronsLeft, ChevronsRight, SlidersHorizontal } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { TOTAL_PAGES, pageRange } from '@/engine/pages';
import { fromAyahId, hizbOf, surahMeta } from '@/engine/quran';
import { haptic } from '@/lib/haptics';
import { basmalaFor, type QuranData } from '@/lib/quranText';
import { TAJWEED_LEGEND, tajweedParts, type TajweedData } from '@/lib/tajweed';
import { useReaderData } from '@/lib/useReaderData';
import { VerseSheet } from './VerseSheet';
import { Sheet, cx } from './ui';

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const arNum = (n: number) => String(n).replace(/\d/g, (d) => AR_DIGITS[+d]);

interface Group { surah: number; ayahs: number[] }
function groupsOf(page: number): Group[] {
  const [a, b] = pageRange(page);
  const out: Group[] = [];
  for (let id = a; id <= b; id++) {
    const { surah, ayah } = fromAyahId(id);
    const g = out[out.length - 1];
    if (g && g.surah === surah) g.ayahs.push(ayah);
    else out.push({ surah, ayahs: [ayah] });
  }
  return out;
}

/**
 * Une page du Mushaf : le texte est ajusté (taille de police) pour remplir l'écran sans défiler,
 * lignes justifiées. Avec un texte agrandi (A+), la page devient défilable.
 */
function Slide({ page, data, tj, tjOn, size, highlight, onVerse }: { page: number; data: QuranData; tj: TajweedData | null; tjOn: boolean; size: number; highlight?: { surah: number; from: number; to: number } | null; onVerse: (s: number, a: number) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(22);
  const groups = useMemo(() => groupsOf(page), [page]);

  // plus grande taille de police pour laquelle toute la page tient dans la hauteur disponible (recherche dichotomique)
  const refit = useCallback(() => {
    const b = box.current;
    const c = body.current;
    if (!b || !c) return;
    const avail = b.clientHeight - 6;
    if (avail <= 0) return;
    let lo = 11;
    let hi = 46;
    for (let i = 0; i < 9; i++) {
      const mid = (lo + hi) / 2;
      c.style.fontSize = `${mid}px`;
      if (c.scrollHeight <= avail) lo = mid;
      else hi = mid;
    }
    c.style.fontSize = `${lo}px`;
    setFit(lo);
  }, []);
  useLayoutEffect(() => {
    refit();
  }, [page, data, tj, tjOn, refit]);
  useEffect(() => {
    const b = box.current;
    if (!b || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => refit());
    ro.observe(b);
    return () => ro.disconnect();
  }, [refit]);

  const colored = (s: number, a: number, text: string) =>
    tj && tjOn ? tajweedParts(text, tj.spans[`${s}:${a}`], tj.families).map(([t, f], i) => (f ? <span key={i} className={`tj-${f}`}>{t}</span> : t)) : text;
  const inHl = (s: number, a: number) => !!highlight && highlight.surah === s && a >= highlight.from && a <= highlight.to;

  return (
    <div ref={box} className={cx('absolute inset-0 px-3.5', size > 1.001 ? 'overflow-y-auto' : 'overflow-hidden')}>
      <div ref={body} className="ar text-justify leading-[1.95] [text-align-last:center]" style={{ fontSize: `${fit * size}px` }} lang="ar" dir="rtl">
        {groups.map((g) => {
          const meta = surahMeta(g.surah);
          const first = g.ayahs[0] === 1;
          const bas = first ? basmalaFor(data, g.surah) : null;
          return (
            <div key={`${g.surah}-${g.ayahs[0]}`}>
              {first && (
                <div className="my-2 rounded-lg border border-line bg-surface2/60 py-1 text-center" style={{ fontSize: '0.95em' }}>
                  <span className="ar">{meta.ar}</span>
                </div>
              )}
              {bas && <p className="mb-1 text-center">{bas}</p>}
              <p>
                {g.ayahs.map((a) => (
                  <span key={a}>
                    <span onClick={() => onVerse(g.surah, a)} className={cx('cursor-pointer rounded-md', inHl(g.surah, a) && 'bg-primary/20')}>{colored(g.surah, a, data.s[g.surah - 1][a - 1])}</span>{' '}
                    <span className="vm">{arNum(a)}</span>{' '}
                  </span>
                ))}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Lecteur de pages plein écran (façon Mushaf numérique) :
 *  - on tourne les pages en glissant (vers la droite : page suivante, comme un livre arabe) ;
 *  - en bas : le nom de la sourate et une bande de pages pour sauter d'un coup ;
 *  - en haut : retour, bascule Pages / Liste, réglages (tajwid, taille du texte, aller à une page).
 */
export function PageReader({ page, onPage, onMode, onClose, highlight }: { page: number; onPage: (p: number) => void; onMode: (m: 'list') => void; onClose: () => void; highlight?: { surah: number; from: number; to: number } | null }) {
  const { data, failed, tj, tjOn, toggleTj, size, zoom } = useReaderData();
  const pg = Math.max(1, Math.min(TOTAL_PAGES, page));
  const [sel, setSel] = useState<{ surah: number; ayah: number } | null>(null);
  const [settings, setSettings] = useState(false);
  const [goto, setGoto] = useState('');
  const view = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; id: number; on: boolean } | null>(null);
  const busy = useRef(false);

  const surahName = surahMeta(groupsOf(pg)[0].surah).tr;
  const juz = Math.ceil(hizbOf(pageRange(pg)[0]) / 2);

  const move = useCallback((dx: number, animate: boolean) => {
    const t = track.current;
    if (!t) return;
    t.style.transition = animate ? 'transform .26s cubic-bezier(.2,.8,.2,1)' : 'none';
    t.style.transform = `translateX(${dx}px)`;
  }, []);

  // tourne la page : dir = +1 (suivante, vers la gauche) / -1 (précédente)
  const turn = useCallback((dir: 1 | -1) => {
    const to = pg + dir;
    const w = view.current?.clientWidth ?? 0;
    if (to < 1 || to > TOTAL_PAGES || busy.current) { move(0, true); return; }
    busy.current = true;
    haptic('select');
    move(dir * w, true);
    setTimeout(() => {
      onPage(to);
      requestAnimationFrame(() => { move(0, false); busy.current = false; });
    }, 240);
  }, [pg, onPage, move]);

  const down = (e: React.PointerEvent) => {
    if (busy.current) return;
    drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId, on: false };
  };
  const mv = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    if (!d.on) {
      if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(e.clientY - d.y)) {
        d.on = true;
        (e.currentTarget as HTMLElement).setPointerCapture(d.id);
      } else return;
    }
    // pas de page avant la 1 ni après la 604 : on retient le geste
    const blocked = (dx > 0 && pg >= TOTAL_PAGES) || (dx < 0 && pg <= 1);
    move(blocked ? dx / 4 : dx, false);
  };
  const up = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || !d.on) return;
    const dx = e.clientX - d.x;
    const w = view.current?.clientWidth ?? 360;
    if (Math.abs(dx) > Math.min(90, w * 0.22)) turn(dx > 0 ? 1 : -1);
    else move(0, true);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') turn(1);
      else if (e.key === 'ArrowRight') turn(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [turn]);

  const strip = useMemo(() => [3, 2, 1, 0, -1, -2, -3].map((o) => pg + o).filter((n) => n >= 1 && n <= TOTAL_PAGES), [pg]);
  const circle = 'grid h-11 w-11 shrink-0 place-items-center rounded-full bg-surface2 text-ink transition active:scale-95 disabled:opacity-35';

  const slideOf = (p: number): ReactNode =>
    p >= 1 && p <= TOTAL_PAGES && data ? <Slide page={p} data={data} tj={tj} tjOn={tjOn} size={size} highlight={highlight} onVerse={(s, a) => { haptic('tap'); setSel({ surah: s, ayah: a }); }} /> : null;

  return createPortal(
    <div className="pt-safe pb-safe fixed inset-0 z-[55] flex flex-col bg-bg" role="dialog" aria-label="Coran numérique, pages">
      {/* barre du haut */}
      <div className="flex items-center justify-between gap-3 px-3.5 pb-2.5 pt-3">
        <button className={circle} onClick={onClose} aria-label="Retour"><ChevronLeft size={22} /></button>
        <div className="flex items-center gap-1 rounded-full bg-surface2 p-1" role="tablist" aria-label="Mode de lecture">
          <button role="tab" aria-selected className="grid h-9 w-12 place-items-center rounded-full bg-primary text-primary-ink" aria-label="Pages"><BookOpen size={19} /></button>
          <button role="tab" aria-selected={false} className="grid h-9 w-12 place-items-center rounded-full text-muted" onClick={() => onMode('list')} aria-label="Liste des versets"><AlignJustify size={19} /></button>
        </div>
        <button className={circle} onClick={() => setSettings(true)} aria-label="Réglages de lecture"><SlidersHorizontal size={19} /></button>
      </div>

      {/* la page */}
      <div ref={view} className="relative min-h-0 flex-1 touch-pan-y select-none overflow-hidden border-y border-line bg-surface" onPointerDown={down} onPointerMove={mv} onPointerUp={up} onPointerCancel={up}>
        {failed && <p className="p-6 text-center text-sm text-muted">Le texte n’a pas pu être chargé. Réessaie une fois connecté.</p>}
        {!data && !failed && <p className="p-6 text-center text-sm text-muted">Chargement…</p>}
        <div ref={track} className="absolute inset-0 will-change-transform">
          <div className="absolute inset-0" style={{ transform: 'translateX(-100%)' }} aria-hidden>{slideOf(pg + 1)}</div>
          <div className="absolute inset-0">{slideOf(pg)}</div>
          <div className="absolute inset-0" style={{ transform: 'translateX(100%)' }} aria-hidden>{slideOf(pg - 1)}</div>
        </div>
      </div>

      {/* bande de pages */}
      <div className="shrink-0 px-3.5 pb-2 pt-2">
        <p className="text-center text-[13px] text-muted">{surahName} · Juz {juz} · page {pg} / {TOTAL_PAGES}</p>
        <div className="mt-2 flex items-center justify-between gap-2">
          <button className={circle} disabled={pg >= TOTAL_PAGES} onClick={() => { haptic('select'); onPage(TOTAL_PAGES); }} aria-label="Dernière page"><ChevronsLeft size={20} /></button>
          <div className="flex min-w-0 flex-1 items-start justify-center gap-1.5" role="group" aria-label="Pages voisines">
            {strip.map((n) => (
              <button key={n} onClick={() => { haptic('select'); onPage(n); }} aria-current={n === pg ? 'page' : undefined} aria-label={`Page ${n}`} className="flex flex-col items-center gap-1">
                <span className={cx('grid h-12 w-9 place-items-center rounded-lg border-2 transition', n === pg ? 'border-accent bg-surface' : 'border-transparent bg-surface2')}>
                  <span className="flex w-5 flex-col gap-[3px]" aria-hidden>{[0, 1, 2, 3].map((i) => <i key={i} className={cx('block h-[3px] rounded-full', n === pg ? 'bg-accent' : 'bg-muted/50')} />)}</span>
                </span>
                <span className={cx('text-[12px] tabular-nums', n === pg ? 'font-bold text-ink' : 'text-muted')}>{n}</span>
              </button>
            ))}
          </div>
          <button className={circle} disabled={pg <= 1} onClick={() => { haptic('select'); onPage(1); }} aria-label="Première page"><ChevronsRight size={20} /></button>
        </div>
      </div>

      <Sheet open={settings} onClose={() => setSettings(false)} title="Réglages de lecture">
        <div className="space-y-5 pb-2">
          <div className="flex items-center justify-between gap-3">
            <div><b className="block">Tajwid</b><span className="text-sm text-muted">Couleurs des règles de récitation</span></div>
            <button className="chip" aria-pressed={tjOn} onClick={toggleTj}>{tjOn ? 'Activé' : 'Désactivé'}</button>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div><b className="block">Taille du texte</b><span className="text-sm text-muted">{size === 1 ? 'Ajustée à l’écran' : `${Math.round(size * 100)} % (la page défile)`}</span></div>
            <div className="flex gap-1.5">
              <button className="chip" onClick={() => zoom(-0.15)} aria-label="Réduire le texte">A−</button>
              <button className="chip" onClick={() => zoom(0.15)} aria-label="Agrandir le texte">A+</button>
            </div>
          </div>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const n = parseInt(goto); if (n >= 1 && n <= TOTAL_PAGES) { onPage(n); setGoto(''); setSettings(false); } }}>
            <input className="input" inputMode="numeric" placeholder="Aller à la page (1–604)" value={goto} onChange={(e) => setGoto(e.target.value.replace(/\D/g, ''))} aria-label="Aller à la page" />
            <button className="btn-primary !px-5" type="submit">Aller</button>
          </form>
          {tj && tjOn && (
            <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-muted">
              {TAJWEED_LEGEND.map((l) => <li key={l.family} className="flex items-center gap-1"><i className={`tj-dot tj-bg-${l.family}`} />{l.label}</li>)}
            </ul>
          )}
        </div>
      </Sheet>
      {sel && <VerseSheet surah={sel.surah} ayah={sel.ayah} onClose={() => setSel(null)} />}
    </div>,
    document.body,
  );
}
