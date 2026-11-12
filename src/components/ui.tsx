import { Check, ChevronLeft, X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { create } from 'zustand';
import { GRADE_LABEL, KIND_LABEL } from '@/engine/config';
import { haptic } from '@/lib/haptics';
import type { Grade, WorkKind } from '@/engine/types';

export const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(' ');

export const GRADE_STYLE: Record<Grade, { chip: string; solid: string; ring: string }> = {
  mastered: { chip: 'bg-good-soft text-good', solid: 'bg-good', ring: 'border-good/40' },
  hesitant: { chip: 'bg-warn-soft text-warn', solid: 'bg-warn', ring: 'border-warn/40' },
  difficult: { chip: 'bg-hard-soft text-hard', solid: 'bg-hard', ring: 'border-hard/40' },
  failed: { chip: 'bg-alert-soft text-alert', solid: 'bg-alert', ring: 'border-alert/40' },
};

export const KIND_STYLE: Record<WorkKind, string> = {
  review: 'bg-soft text-primary',
  reinforce: 'bg-hard-soft text-hard',
  learn: 'bg-blue-soft text-blue',
};

export function GradeChip({ grade }: { grade: Grade }) {
  return <span className={cx('inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold', GRADE_STYLE[grade].chip)}>{GRADE_LABEL[grade]}</span>;
}

export function KindBadge({ kind }: { kind: WorkKind }) {
  return <span className={cx('inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold', KIND_STYLE[kind])}>{KIND_LABEL[kind]}</span>;
}

export function ProgressBar({ value, tone = 'primary', className }: { value: number; tone?: 'primary' | 'good' | 'warn' | 'blue' | 'gold'; className?: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const fill = { primary: 'bg-primary', good: 'bg-good', warn: 'bg-warn', blue: 'bg-blue', gold: 'bg-primary' }[tone];
  return (
    <div className={cx('h-1.5 w-full overflow-hidden rounded-full bg-surface2', className)} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cx('h-full rounded-full transition-[width] duration-500', fill)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Ring({ value, size = 64, stroke = 6, children }: { value: number; size?: number; stroke?: number; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-surface2" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round" className="stroke-primary transition-[stroke-dashoffset] duration-700" strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0, Math.min(1, value)))} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-sm font-bold">{children}</div>
    </div>
  );
}

/** Numéro de sourate : petite tuile crème, chiffres en serif. */
export function SurahNumber({ n, size = 40 }: { n: number; size?: number }) {
  return (
    <div className="flex shrink-0 items-center justify-center rounded-xl bg-surface2 font-display font-semibold tabular-nums text-primary" style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {n}
    </div>
  );
}

/** Conservé pour compatibilité : la référence n'utilise pas de filet orné. */
export function Rule({ className }: { className?: string }) {
  return <div className={cx('h-px bg-line', className)} aria-hidden />;
}

/** Choix d'une option parmi quelques-unes : pastilles crème, l'active en vert (comme la référence). */
export function Segmented<T extends string>({ options, value, onChange, scroll }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; scroll?: boolean }) {
  return (
    <div role="radiogroup" className={cx('flex gap-2', scroll ? 'no-scrollbar -mx-4 overflow-x-auto px-4' : 'flex-wrap')}>
      {options.map((o) => (
        <button key={o.value} role="radio" aria-checked={o.value === value} onClick={() => onChange(o.value)} className={cx('chip', !scroll && 'flex-1 justify-center')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Onglets de page : rangée de pastilles défilable. */
export function Tabs<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div role="tablist" className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={o.value === value} onClick={() => onChange(o.value)} className="chip">
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y0: number; last: number; t: number; v: number } | null>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;

  // Glisser la poignée vers le bas ferme la feuille (distance ou vitesse) ; sinon elle revient en place.
  const down = (e: React.PointerEvent) => {
    drag.current = { y0: e.clientY, last: e.clientY, t: performance.now(), v: 0 };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (ref.current) ref.current.style.transition = 'none';
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !ref.current) return;
    const now = performance.now();
    d.v = (e.clientY - d.last) / Math.max(1, now - d.t);
    d.last = e.clientY;
    d.t = now;
    ref.current.style.transform = `translateY(${Math.max(0, e.clientY - d.y0)}px)`;
  };
  const up = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || !ref.current) return;
    const dy = e.clientY - d.y0;
    ref.current.style.transition = 'transform .25s cubic-bezier(.2,.8,.2,1)';
    if (dy > 120 || d.v > 0.7) {
      ref.current.style.transform = 'translateY(100%)';
      haptic('tap');
      setTimeout(onClose, 200);
    } else ref.current.style.transform = '';
  };

  // Portail : la feuille doit passer au-dessus de la barre de navigation, quel que soit le contexte d'empilement du parent.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 animate-fade bg-ink/40 backdrop-blur-[2px]" onClick={onClose} />
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className="pb-safe relative max-h-[88dvh] w-full max-w-[520px] animate-sheet-up overflow-y-auto rounded-t-[22px] bg-bg px-4 pb-6 shadow-[0_-6px_30px_rgba(0,0,0,.2)] outline-none sm:rounded-[22px]">
        <div className="sticky top-0 z-10 -mx-4 touch-none bg-bg px-4 pb-2 pt-2.5" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
          <i className="mx-auto mb-2 block h-[5px] w-11 rounded-full bg-line" />
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-[22px] font-semibold">{title}</h2>
            <button onClick={onClose} onPointerDown={(e) => e.stopPropagation()} aria-label="Fermer" className="flex h-10 w-10 items-center justify-center rounded-full bg-surface2 text-muted">
              <X size={18} />
            </button>
          </div>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmSheet({ open, onClose, onConfirm, title, message, confirmLabel, danger }: { open: boolean; onClose: () => void; onConfirm: () => void; title: string; message: string; confirmLabel: string; danger?: boolean }) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <p className="mb-5 text-[15px] leading-relaxed text-muted">{message}</p>
      <div className="flex flex-col gap-2">
        <button
          className={danger ? 'btn-danger' : 'btn-primary'}
          onClick={() => {
            onConfirm();
            onClose();
          }}
        >
          {confirmLabel}
        </button>
        <button className="btn-ghost" onClick={onClose}>
          Annuler
        </button>
      </div>
    </Sheet>
  );
}

// ---------- Toast ----------
interface ToastAction {
  label: string;
  onClick: () => void;
}
interface ToastState {
  msg: string | null;
  action: ToastAction | null;
  show: (m: string, action?: ToastAction, ms?: number) => void;
  hide: () => void;
}
let toastTimer: ReturnType<typeof setTimeout> | undefined;
export const useToast = create<ToastState>((set) => ({
  msg: null,
  action: null,
  show: (m, action, ms) => {
    set({ msg: m, action: action ?? null });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => set({ msg: null, action: null }), ms ?? (action ? 8000 : 2600));
  },
  hide: () => set({ msg: null, action: null }),
}));
export const toast = (m: string, action?: ToastAction, ms?: number) => useToast.getState().show(m, action, ms);

export function ToastHost() {
  const { msg, action, hide } = useToast();
  if (!msg) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex justify-center px-4 lg:bottom-8" role="status" aria-live="polite">
      <div className="pointer-events-auto flex animate-pop items-center gap-3 rounded-full bg-primary py-2.5 pl-[18px] pr-3 text-sm font-semibold text-primary-ink shadow-[0_6px_20px_rgba(0,0,0,.25)]">
        <span className="flex items-center gap-2"><Check size={16} /> {msg}</span>
        {action && (
          <button className="rounded-full bg-white/20 px-3 py-1 font-bold" onClick={() => { haptic('tap'); action.onClick(); hide(); }}>
            {action.label}
          </button>
        )}
      </div>
    </div>
  );
}

// ---------- Mises en page ----------
export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('mx-auto w-full max-w-[520px] animate-fade px-4 pb-8 pt-safe', className)}>{children}</div>;
}

/** Écran principal : titre serif sur fond crème, onglets en pastilles, contenu en cartes. */
export function Screen({ title, sub, right, tabs, children }: { title: ReactNode; sub?: ReactNode; right?: ReactNode; tabs?: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[520px] animate-fade px-4 pb-10 pt-safe">
      <header className="pt-[18px]">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            {sub && <p className="text-sm text-muted">{sub}</p>}
            <h1 className="mb-1 mt-1 font-display text-[26px] font-semibold leading-tight tracking-[-0.2px]">{title}</h1>
          </div>
          {right}
        </div>
        {tabs && <div className="mt-3">{tabs}</div>}
      </header>
      <div className="mt-4">{children}</div>
    </div>
  );
}

export function PageTitle({ children, sub, right }: { children: ReactNode; sub?: string; right?: ReactNode }) {
  return (
    <header className="flex items-end justify-between gap-3 pb-4 pt-5">
      <div>
        <h1 className="font-display text-[26px] font-semibold leading-tight">{children}</h1>
        {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
      </div>
      {right}
    </header>
  );
}

export function SubPage({ title, children, back = -1, sub }: { title: string; children: ReactNode; back?: number | string; sub?: ReactNode }) {
  const nav = useNavigate();
  return (
    <div className="mx-auto w-full max-w-[520px] animate-fade px-4 pb-10 pt-safe">
      <header className="pt-3">
        <button onClick={() => (typeof back === 'number' ? nav(back) : nav(back))} className="-ml-1 flex min-h-[40px] items-center gap-0.5 py-1.5 pr-3 font-semibold text-primary">
          <ChevronLeft size={20} /> Retour
        </button>
        <h1 className="mb-1 mt-2 font-display text-[26px] font-semibold leading-tight tracking-[-0.2px]">{title}</h1>
        {sub && <div className="text-sm text-muted">{sub}</div>}
      </header>
      <div className="mt-4">{children}</div>
    </div>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="card px-6 py-8 text-center">
      <p className="font-display text-lg font-semibold">{title}</p>
      {children && <div className="mx-auto mt-1.5 max-w-xs text-sm leading-relaxed text-muted">{children}</div>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function Row({ children, onClick, className }: { children: ReactNode; onClick?: () => void; className?: string }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag onClick={onClick} className={cx('flex w-full items-center gap-3 px-4 py-3.5 text-left', onClick && 'transition active:bg-surface2', className)}>
      {children}
    </Tag>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} className={cx('relative h-7 w-12 shrink-0 rounded-full transition', checked ? 'bg-primary' : 'bg-line')}>
      <span className={cx('absolute top-0.5 h-6 w-6 rounded-full bg-surface shadow transition-all', checked ? 'left-[22px]' : 'left-0.5')} />
    </button>
  );
}

/** Pied d'écran collé en bas (actions principales), au-dessus de la zone sûre. */
export function StickyFooter({ children }: { children: ReactNode }) {
  return (
    <div className="pb-safe fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface">
      <div className="mx-auto max-w-[520px] px-4 pb-4 pt-3">{children}</div>
    </div>
  );
}
