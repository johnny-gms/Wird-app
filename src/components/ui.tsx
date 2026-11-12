import { Check, ChevronLeft, X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { create } from 'zustand';
import { GRADE_LABEL, KIND_LABEL } from '@/engine/config';
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
  const fill = { primary: 'bg-primary', good: 'bg-good', warn: 'bg-warn', blue: 'bg-blue', gold: 'bg-gold' }[tone];
  return (
    <div className={cx('h-1 w-full overflow-hidden rounded-full bg-line/70', className)} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
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

/** Médaillon de numéro : étoile à huit pointes (« rub‘ al-hizb », repère classique du Mushaf), filet doré. */
export function SurahNumber({ n, size = 40 }: { n: number; size?: number }) {
  return (
    <div className="relative flex shrink-0 items-center justify-center font-display font-semibold text-primary" style={{ width: size, height: size, fontSize: size * 0.34 }}>
      <svg viewBox="0 0 40 40" className="absolute inset-0 text-gold" aria-hidden>
        <rect x="9" y="9" width="22" height="22" rx="1.5" fill="rgb(var(--surface))" stroke="currentColor" strokeWidth="1" />
        <rect x="9" y="9" width="22" height="22" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1" transform="rotate(45 20 20)" />
      </svg>
      <span className="relative tabular-nums">{n}</span>
    </div>
  );
}

/** Filet orné : trait – losange – trait. */
export function Rule({ className }: { className?: string }) {
  return (
    <div className={cx('flex items-center gap-3 text-gold', className)} aria-hidden>
      <span className="h-px flex-1 bg-current opacity-50" />
      <span className="h-1.5 w-1.5 rotate-45 border border-current" />
      <span className="h-px flex-1 bg-current opacity-50" />
    </div>
  );
}

/** Choix d'une option parmi quelques-unes (réglages). */
export function Segmented<T extends string>({ options, value, onChange, scroll }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; scroll?: boolean }) {
  return (
    <div role="radiogroup" className={cx('flex gap-1.5', scroll && 'no-scrollbar -mx-5 overflow-x-auto px-5')}>
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx('min-h-[42px] shrink-0 whitespace-nowrap rounded-[10px] border px-3.5 text-sm font-semibold transition', scroll ? '' : 'flex-1 px-2', o.value === value ? 'border-deep bg-deep text-ivory' : 'border-line bg-surface text-muted hover:text-ink')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Onglets de page : texte + soulignement doré (utilisé dans le bandeau d'en-tête). */
export function Tabs<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div role="tablist" className="no-scrollbar -mx-5 flex gap-6 overflow-x-auto px-5">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={o.value === value} onClick={() => onChange(o.value)} className={cx('relative shrink-0 whitespace-nowrap pb-3 pt-1 text-[14px] font-semibold transition', o.value === value ? 'text-ivory' : 'text-ivory/60 hover:text-ivory')}>
          {o.label}
          {o.value === value && <span className="absolute inset-x-0 bottom-0 h-[2px] rounded-full bg-gold" />}
        </button>
      ))}
    </div>
  );
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
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
  // Portail : la feuille doit passer au-dessus de la barre de navigation, quel que soit le contexte d'empilement du parent.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 animate-fade bg-ink/40 backdrop-blur-[2px]" onClick={onClose} />
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className="pb-safe relative max-h-[88dvh] w-full max-w-lg animate-sheet-up overflow-y-auto rounded-t-[22px] border-t border-gold/40 bg-bg p-5 outline-none sm:rounded-[22px] sm:border">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-display text-xl font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Fermer" className="flex h-10 w-10 items-center justify-center rounded-full bg-surface2 text-muted">
            <X size={18} />
          </button>
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
interface ToastState {
  msg: string | null;
  show: (m: string) => void;
}
let toastTimer: ReturnType<typeof setTimeout> | undefined;
export const useToast = create<ToastState>((set) => ({
  msg: null,
  show: (m) => {
    set({ msg: m });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => set({ msg: null }), 2600);
  },
}));
export const toast = (m: string) => useToast.getState().show(m);

export function ToastHost() {
  const msg = useToast((s) => s.msg);
  if (!msg) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex justify-center px-4 lg:bottom-8" role="status" aria-live="polite">
      <div className="flex animate-pop items-center gap-2 rounded-full bg-ink px-4 py-3 text-sm font-semibold text-bg shadow-lg">
        <Check size={16} /> {msg}
      </div>
    </div>
  );
}

// ---------- Mises en page ----------
export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('mx-auto w-full max-w-2xl animate-fade px-5 pb-8 pt-safe', className)}>{children}</div>;
}

/**
 * Écran principal : bandeau vert profond (titre serif, filet orné, onglets éventuels) puis feuille de contenu ivoire.
 */
export function Screen({ title, sub, right, tabs, children }: { title: ReactNode; sub?: ReactNode; right?: ReactNode; tabs?: ReactNode; children: ReactNode }) {
  return (
    <div className="animate-fade">
      <header className="bg-deep pt-safe text-ivory">
        <div className="mx-auto max-w-2xl px-5 pb-0 pt-7">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="font-display text-[30px] font-semibold leading-[1.1] tracking-tight">{title}</h1>
              {sub && <p className="mt-1.5 text-[13px] text-ivory/70">{sub}</p>}
            </div>
            {right}
          </div>
          <Rule className="mb-3 mt-4" />
          {tabs ?? <div className="h-3" />}
        </div>
      </header>
      <div className="-mt-px rounded-t-[22px] bg-bg">
        <div className="mx-auto w-full max-w-2xl px-5 pb-10 pt-6">{children}</div>
      </div>
    </div>
  );
}

export function PageTitle({ children, sub, right }: { children: ReactNode; sub?: string; right?: ReactNode }) {
  return (
    <header className="flex items-end justify-between gap-3 pb-4 pt-8">
      <div>
        <h1 className="font-display text-[28px] font-semibold leading-tight tracking-tight">{children}</h1>
        {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
      </div>
      {right}
    </header>
  );
}

export function SubPage({ title, children, back = -1, sub }: { title: string; children: ReactNode; back?: number | string; sub?: ReactNode }) {
  const nav = useNavigate();
  return (
    <div className="animate-fade">
      <header className="bg-deep pt-safe text-ivory">
        <div className="mx-auto max-w-2xl px-5 pb-1 pt-4">
          <button onClick={() => (typeof back === 'number' ? nav(back) : nav(back))} aria-label="Retour" className="-ml-2 flex h-10 w-10 items-center justify-center rounded-full text-ivory/80 hover:bg-white/10">
            <ChevronLeft size={22} />
          </button>
          <h1 className="mt-1 font-display text-[28px] font-semibold leading-tight tracking-tight">{title}</h1>
          {sub && <div className="mt-1 text-[13px] text-ivory/70">{sub}</div>}
          <Rule className="mb-3 mt-4" />
        </div>
      </header>
      <div className="-mt-px rounded-t-[22px] bg-bg">
        <div className="mx-auto w-full max-w-2xl px-5 pb-10 pt-6">{children}</div>
      </div>
    </div>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line px-6 py-10 text-center">
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
