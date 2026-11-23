import { Pointer } from 'lucide-react';
import { X } from 'lucide-react';
import { cx } from './ui';

/** Petites animations « comment faire » : un doigt qui glisse sur des versets, qui tourne une page, qui touche deux fois. */
export function FingerDemo({ kind, className }: { kind: 'slide' | 'swipe' | 'double'; className?: string }) {
  if (kind === 'slide') {
    return (
      <div className={cx('fd fd-slide relative mx-auto flex w-full max-w-[260px] items-center justify-between gap-1.5 py-5', className)} aria-hidden>
        {[1, 2, 3, 4, 5, 6].map((n, i) => (
          <i key={n} className="fd-chip flex aspect-square w-[34px] items-center justify-center rounded-lg bg-surface2 text-[13px] font-semibold not-italic text-muted" style={{ animationDelay: `${i * 0.22}s` }}>{n}</i>
        ))}
        <Pointer className="fd-finger absolute top-[22px] text-ink drop-shadow" size={30} strokeWidth={1.6} fill="rgb(var(--surface))" />
      </div>
    );
  }
  if (kind === 'swipe') {
    return (
      <div className={cx('fd fd-swipe relative mx-auto h-[84px] w-[150px]', className)} aria-hidden>
        <i className="fd-page absolute left-8 top-1 block h-[76px] w-[56px] rounded-md border border-line bg-surface2" />
        <i className="fd-page2 absolute left-8 top-1 block h-[76px] w-[56px] rounded-md border border-line bg-surface" />
        <Pointer className="fd-finger-swipe absolute top-9 text-ink drop-shadow" size={30} strokeWidth={1.6} fill="rgb(var(--surface))" />
      </div>
    );
  }
  return (
    <div className={cx('fd fd-double relative mx-auto h-[70px] w-[90px]', className)} aria-hidden>
      <i className="fd-ripple absolute left-[30px] top-[14px] block h-[26px] w-[26px] rounded-full bg-accent/40" />
      <Pointer className="fd-finger-tap absolute left-[26px] top-[16px] text-ink drop-shadow" size={30} strokeWidth={1.6} fill="rgb(var(--surface))" />
    </div>
  );
}

/** Carte d'astuce : animation + phrase + « Compris ». */
export function TipCard({ kind, title, text, onClose, action }: { kind: 'slide' | 'swipe' | 'double'; title: string; text: string; onClose: () => void; action?: { label: string; onClick: () => void } }) {
  return (
    <div className="card relative mb-3 p-3.5 pr-10" role="note">
      <button className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-surface2" onClick={onClose} aria-label="Fermer l’astuce"><X size={16} /></button>
      <p className="text-[12px] font-bold uppercase tracking-[1.2px] text-accent">Astuce</p>
      <p className="mt-0.5 text-[15px] font-semibold">{title}</p>
      <FingerDemo kind={kind} />
      <p className="text-[13px] leading-relaxed text-muted">{text}</p>
      <div className="mt-2.5 flex gap-2">
        {action && <button className="btn-primary !min-h-[40px] flex-1 text-sm" onClick={action.onClick}>{action.label}</button>}
        <button className="btn-soft !min-h-[40px] flex-1 text-sm" onClick={onClose}>Compris</button>
      </div>
    </div>
  );
}
