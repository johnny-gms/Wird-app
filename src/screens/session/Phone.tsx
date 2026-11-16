import { BookOpen, Check, Eye, EyeOff, Smartphone } from 'lucide-react';
import { useEffect, useState } from 'react';
import { KindBadge, SurahNumber, cx } from '@/components/ui';
import { itemPages, itemSig } from '@/engine/plan';
import { formatPages, pageOf } from '@/engine/pages';
import { ayahId, hizbOf, rangeLabel, surahMeta } from '@/engine/quran';
import type { PhoneProgress, PlanItem, SessionMode } from '@/engine/types';
import { haptic } from '@/lib/haptics';
import { basmalaFor, loadQuranText, type QuranData } from '@/lib/quranText';

const MODE_KEY = 'wird-session-mode';
export const lastMode = (): SessionMode | null => {
  try { const v = localStorage.getItem(MODE_KEY); return v === 'mushaf' || v === 'phone' ? v : null; } catch { return null; }
};
export const rememberMode = (m: SessionMode) => {
  try { localStorage.setItem(MODE_KEY, m); } catch { /* ignore */ }
};

/** Références de Mushaf d'un passage : page de Médine et Juz. */
export const mushafRef = (it: Pick<PlanItem, 'surah' | 'from'>): string => {
  const id = ayahId(it.surah, it.from);
  return `page ${pageOf(id)} · Juz ${Math.ceil(hizbOf(id) / 2)}`;
};

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const arNum = (n: number) => String(n).replace(/\d/g, (d) => AR_DIGITS[+d]);

// ------------------------------------------------------------------ Choix du mode
export function ChooseMode({ onChoose }: { onChoose: (m: SessionMode) => void }) {
  const last = lastMode();
  const opts: { v: SessionMode; icon: React.ReactNode; title: string; sub: string }[] = [
    { v: 'mushaf', icon: <BookOpen size={26} />, title: 'Avec mon Mushaf', sub: 'Tu travailles sur ton Coran papier. WIRD te donne la feuille de route ; tu évalues à la fin.' },
    { v: 'phone', icon: <Smartphone size={26} />, title: 'Avec mon téléphone', sub: 'Tu lis et mémorises dans WIRD : les versets se dévoilent un à un, tu récites de mémoire.' },
  ];
  return (
    <div className="grid gap-3" role="radiogroup" aria-label="Mode de séance">
      {opts.map((o) => (
        <button key={o.v} role="radio" aria-checked={last === o.v} onClick={() => { haptic('select'); rememberMode(o.v); onChoose(o.v); }} className={cx('flex items-start gap-4 rounded-[20px] border-2 bg-surface p-5 text-left transition active:scale-[.99]', last === o.v ? 'border-primary' : 'border-line')}>
          <span className="mt-0.5 text-primary">{o.icon}</span>
          <span className="flex-1"><b className="block text-[17px]">{o.title}</b><span className="mt-1 block text-sm leading-snug text-muted">{o.sub}</span></span>
        </button>
      ))}
      <p className="text-center text-xs text-muted">Même programme, même historique, même évaluation dans les deux modes.</p>
    </div>
  );
}

// ------------------------------------------------------------------ Mode Téléphone : feuille de route
export function PhoneProgram({ items, phone, onOpen }: { items: PlanItem[]; phone: Record<string, PhoneProgress>; onOpen: (it: PlanItem) => void }) {
  return (
    <>
      <p className="mb-4 text-sm leading-relaxed text-muted">Choisis un passage et travaille-le verset par verset, dans l’ordre de ton choix. WIRD n’écoute ni n’enregistre rien : tu récites de mémoire, puis tu évalues à la fin.</p>
      <ol className="space-y-2.5">
        {items.map((it, idx) => {
          const p = phone[itemSig(it)];
          const state = p?.done ? 'done' : p && (p.shown > 1 || p.hidden) ? 'doing' : 'todo';
          const meta = surahMeta(it.surah);
          return (
            <li key={it.id} className="card flex items-center gap-3 px-3.5 py-3.5">
              <span className="w-5 text-center font-display text-lg font-semibold tabular-nums text-muted">{idx + 1}</span>
              <SurahNumber n={it.surah} size={40} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold">{meta.tr}</span>
                <span className="mt-0.5 block text-[13px] text-muted">{rangeLabel(it.surah, it.from, it.to).replace(/^Sourate \d+ — /, '')} · {mushafRef(it)}</span>
                <span className="mt-1.5 flex items-center gap-1.5"><KindBadge kind={it.kind} />{state === 'done' && <span className="inline-flex items-center gap-1 rounded-full bg-good px-2 py-0.5 text-[11px] font-semibold text-white"><Check size={11} strokeWidth={3} /> Travaillé</span>}{state === 'doing' && <span className="rounded-full bg-blue-soft px-2 py-0.5 text-[11px] font-semibold text-blue">En cours</span>}</span>
              </span>
              <button className={cx(state === 'done' ? 'btn-soft' : 'btn-primary', '!min-h-[40px] !px-3 text-sm')} onClick={() => onOpen(it)}>{state === 'done' ? 'Revoir' : state === 'doing' ? 'Continuer' : 'Travailler'}</button>
            </li>
          );
        })}
      </ol>
    </>
  );
}

// ------------------------------------------------------------------ Mode Téléphone : travail d'un passage
export function PhoneWork({ item, progress, onChange, onClose }: { item: PlanItem; progress: PhoneProgress; onChange: (patch: Partial<PhoneProgress>) => void; onClose: () => void }) {
  const [data, setData] = useState<QuranData | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    void loadQuranText().then((d) => (d ? setData(d) : setFailed(true)));
  }, []);
  const meta = surahMeta(item.surah);
  const n = item.to - item.from + 1;
  const shown = Math.max(1, Math.min(n, progress.shown));
  const verses = data ? data.s[item.surah - 1].slice(item.from - 1, item.to) : null;
  const bas = data && item.from === 1 ? basmalaFor(data, item.surah) : null;
  const last = shown >= n;

  return (
    <section aria-label="Travail du passage">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="title-section">{meta.tr}</h2>
        <span className="text-sm text-muted">{rangeLabel(item.surah, item.from, item.to).replace(/^Sourate \d+ — /, '')}</span>
      </div>
      <p className="mt-0.5 text-sm text-muted">Verset {shown} sur {n} · {mushafRef(item)} · {formatPages(itemPages(item))}</p>

      <div className="card relative mt-4 p-4">
        {failed && <p className="text-sm text-muted">Le texte n’a pas pu être chargé. Utilise ton Mushaf.</p>}
        {!failed && !verses && <p className="text-sm text-muted">Chargement…</p>}
        {verses && (
          <div className="relative">
            {bas && <p className="ar mb-2 text-center text-[24px] leading-[2] text-primary" lang="ar">{bas}</p>}
            <p className={cx('ar text-[28px] leading-[2.3] transition', progress.hidden && 'select-none blur-[9px]')} lang="ar" aria-hidden={progress.hidden} data-testid="verses">
              {verses.slice(0, shown).map((v, i) => (
                <span key={i}>{v} <span className="text-primary">﴿{arNum(item.from + i)}﴾</span>{' '}</span>
              ))}
            </p>
            {progress.hidden && <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-center text-sm font-semibold text-ink/70">Texte masqué — récite de mémoire</p>}
          </div>
        )}
      </div>

      <div className="mt-4 grid gap-2.5">
        <button className="btn-soft" onClick={() => { haptic('select'); onChange({ hidden: !progress.hidden }); }}>
          {progress.hidden ? <><Eye size={18} /> Afficher</> : <><EyeOff size={18} /> Masquer</>}
        </button>
        {!last ? (
          <button className="btn-primary" onClick={() => { haptic('tap'); onChange({ shown: shown + 1, hidden: false }); }}>Verset suivant</button>
        ) : (
          <>
            {!progress.hidden && <button className="btn-soft" onClick={() => { haptic('select'); onChange({ hidden: true }); }}>Réciter tout le passage sans le texte (facultatif)</button>}
            <button className="btn-primary" onClick={() => { haptic('success'); onChange({ done: true }); onClose(); }}><Check size={18} /> Passage terminé</button>
          </>
        )}
        <button className="py-2 text-sm font-semibold text-primary" onClick={onClose}>Retour à la liste des passages</button>
      </div>
      <p className="mt-3 text-center text-xs leading-relaxed text-muted">Tu peux répéter un verset autant que nécessaire, réafficher le texte à tout moment. Aucune pénalité, aucun compteur.</p>
    </section>
  );
}
