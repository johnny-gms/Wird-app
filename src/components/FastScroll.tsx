import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { cx } from './ui';

/**
 * Barre de défilement rapide : un curseur que l'on attrape et déplace pour parcourir la liste d'un geste.
 * Pendant le glissement, une bulle indique où l'on se trouve (ex. numéro de sourate).
 * Elle pilote le défilement de la page ; `targetRef` délimite la liste concernée.
 */
export function FastScroll({ targetRef, count, label, top = 150, bottom = 96 }: { targetRef: RefObject<HTMLElement | null>; count: number; label: (index: number) => string; top?: number; bottom?: number }) {
  const [p, setP] = useState(0);
  const [visible, setVisible] = useState(false);
  const [drag, setDrag] = useState(false);
  const track = useRef<HTMLDivElement>(null);
  const raf = useRef(0);

  const bounds = useCallback(() => {
    const el = targetRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const start = r.top + window.scrollY - top; // défilement où le haut de la liste touche l'en-tête
    const end = r.top + window.scrollY + r.height - window.innerHeight + bottom;
    return { start, end };
  }, [targetRef, top, bottom]);

  const sync = useCallback(() => {
    const b = bounds();
    if (!b) return;
    setVisible(b.end - b.start > window.innerHeight * 0.8);
    const v = (window.scrollY - b.start) / Math.max(1, b.end - b.start);
    setP(Math.max(0, Math.min(1, v)));
  }, [bounds]);

  useEffect(() => {
    const onScroll = () => {
      cancelAnimationFrame(raf.current);
      raf.current = requestAnimationFrame(sync);
    };
    sync();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    const ro = new ResizeObserver(onScroll);
    if (targetRef.current) ro.observe(targetRef.current);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      ro.disconnect();
      cancelAnimationFrame(raf.current);
    };
  }, [sync, targetRef, count]);

  const moveTo = (clientY: number) => {
    const t = track.current;
    const b = bounds();
    if (!t || !b) return;
    const r = t.getBoundingClientRect();
    const v = Math.max(0, Math.min(1, (clientY - r.top - THUMB / 2) / (r.height - THUMB)));
    setP(v);
    window.scrollTo({ top: b.start + v * (b.end - b.start) });
  };

  if (!visible) return null;
  const idx = Math.max(0, Math.min(count - 1, Math.round(p * (count - 1))));
  return (
    <div
      ref={track}
      className="fixed right-0 z-30 w-9 touch-none select-none"
      style={{ top, bottom }}
      onPointerDown={(e) => {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        setDrag(true);
        moveTo(e.clientY);
      }}
      onPointerMove={(e) => drag && moveTo(e.clientY)}
      onPointerUp={() => setDrag(false)}
      onPointerCancel={() => setDrag(false)}
      role="slider"
      aria-label="Défilement rapide"
      aria-valuemin={1}
      aria-valuemax={count}
      aria-valuenow={idx + 1}
      tabIndex={0}
      onKeyDown={(e) => {
        const b = bounds();
        if (!b) return;
        if (e.key === 'ArrowDown') window.scrollBy({ top: 200 });
        if (e.key === 'ArrowUp') window.scrollBy({ top: -200 });
      }}
    >
      
      <div className={cx('absolute right-1.5 flex items-center transition-transform', drag && 'scale-110')} style={{ top: `calc(${p} * (100% - ${THUMB}px))`, height: THUMB }}>
        {drag && <span className="absolute right-9 whitespace-nowrap rounded-xl bg-primary px-3 py-1.5 text-sm font-semibold text-primary-ink shadow-lg">{label(idx)}</span>}
        <span className={cx('block h-full rounded-full bg-primary transition-all', drag ? 'w-[12px] opacity-100' : 'w-[7px] opacity-70')} />
      </div>
    </div>
  );
}
const THUMB = 44;
