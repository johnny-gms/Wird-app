import { ArrowLeft, BookOpen, Check, ChevronDown, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GradeChip, KindBadge, SurahNumber, cx, toast, GRADE_STYLE } from '@/components/ui';
import { GRADE_HINT, GRADE_LABEL, GRADE_ORDER } from '@/engine/config';
import { formatPages } from '@/engine/pages';
import { itemPages } from '@/engine/plan';
import { rangeLabel, surahMeta } from '@/engine/quran';
import type { DraftGrade, PlanItem } from '@/engine/types';
import { basmalaFor, loadQuranText, type QuranData } from '@/lib/quranText';
import { haptic } from '@/lib/haptics';
import { Reader } from '@/components/Reader';
import { pageOf } from '@/engine/pages';
import { ayahId } from '@/engine/quran';
import { useWird } from '@/store/useWird';

/** Temps actif : uniquement pendant que l'écran est visible et que l'utilisateur interagit (pause après 3 min d'inactivité). */
function useActiveTimer() {
  const acc = useRef(0);
  const lastInteraction = useRef(Date.now());
  const addActiveTime = useWird((s) => s.addActiveTime);
  const flush = useCallback(() => {
    if (acc.current > 0) {
      addActiveTime(acc.current);
      acc.current = 0;
    }
  }, [addActiveTime]);
  useEffect(() => {
    const touch = () => (lastInteraction.current = Date.now());
    const tick = setInterval(() => {
      if (document.visibilityState === 'visible' && Date.now() - lastInteraction.current < 180_000) acc.current += 1000;
    }, 1000);
    const onHide = () => document.visibilityState === 'hidden' && flush();
    window.addEventListener('pointerdown', touch);
    window.addEventListener('keydown', touch);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      clearInterval(tick);
      window.removeEventListener('pointerdown', touch);
      window.removeEventListener('keydown', touch);
      document.removeEventListener('visibilitychange', onHide);
      flush();
    };
  }, [flush]);
  return flush;
}

export default function Session() {
  const nav = useNavigate();
  const { session, plan, startSession, openEvaluation, backToProgram, setDraft, validateSession } = useWird();
  const flush = useActiveTimer();
  const [reader, setReader] = useState<PlanItem | null>(null);

  // Garde l'écran allumé pendant la séance (si l'appareil le permet) : aucune interruption pendant le travail.
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const req = async () => {
      try {
        lock = await (navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request('screen') ?? null;
      } catch {
        lock = null;
      }
    };
    void req();
    const onVis = () => document.visibilityState === 'visible' && void req();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      void lock?.release();
    };
  }, []);

  // Entrée sur l'écran : reprend la séance ouverte, ou en ouvre une (tout le programme restant).
  useEffect(() => {
    const st = useWird.getState();
    if (st.session) return;
    if (!startSession()) nav(st.plan?.items.length ? '/session/bilan' : '/', { replace: true });
  }, [nav, startSession]);

  const items = useMemo<PlanItem[]>(() => {
    if (!session || !plan) return [];
    return plan.items.filter((i) => i.status === 'pending' && (session.scope === 'all' || session.scope.includes(i.id)));
  }, [session, plan]);

  if (!session || !plan) return null;
  const total = items.length;
  const pages = items.reduce((a, i) => a + itemPages(i), 0);
  const decided = items.filter((i) => session.draft[i.id]).length;

  const leave = () => {
    flush();
    toast('Séance enregistrée — tu pourras la reprendre');
    nav('/', { replace: true });
  };
  const validate = () => {
    flush();
    const r = validateSession();
    if (r === 'bilan') {
      haptic('success');
      nav('/session/bilan', { replace: true });
      toast('Séance validée', { label: 'Annuler', onClick: () => { if (useWird.getState().undoValidation()) nav('/session', { replace: true }); } });
    } else {
      nav('/', { replace: true });
      toast('Aucun élément évalué — rien n’est enregistré');
    }
  };

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="pt-safe mx-auto w-full max-w-[520px] px-4 pt-3">
        <div className="flex items-center justify-between">
          {session.step === 'program' ? (
            <button onClick={leave} className="-ml-1 flex min-h-[40px] items-center gap-1 pr-3 font-semibold text-primary"><X size={18} /> Interrompre</button>
          ) : (
            <button onClick={backToProgram} className="-ml-1 flex min-h-[40px] items-center gap-1 pr-3 font-semibold text-primary"><ArrowLeft size={18} /> Retour au programme</button>
          )}
          <span className="text-xs font-semibold text-muted">{session.step === 'program' ? 'Étape 1 / 2' : 'Étape 2 / 2'}</span>
        </div>
        <h1 className="mb-1 mt-2 font-display text-[26px] font-semibold leading-tight tracking-[-0.2px]">{session.step === 'program' ? 'Séance du jour' : 'Bilan de la séance'}</h1>
        <p className="text-sm text-muted">
          {session.step === 'program' ? `${total} élément${total > 1 ? 's' : ''} · ${formatPages(pages)}` : `Comment s’est passé chaque élément ? ${decided} / ${total}`}
        </p>
      </header>

      <main className="mx-auto w-full max-w-[520px] flex-1 px-4 pb-40 pt-4">
        {session.step === 'program' ? (
          <Program items={items} onReader={setReader} />
        ) : (
          <Evaluate items={items} draft={session.draft} onSet={setDraft} />
        )}
      </main>

      {reader && createPortal(
        <div className="fixed inset-0 z-[55] animate-slide-in overflow-y-auto bg-bg" role="dialog" aria-label="Coran numérique">
          <div className="pt-safe mx-auto w-full max-w-[520px] px-4 pb-16">
            <button onClick={() => setReader(null)} className="-ml-1 mt-3 flex min-h-[40px] items-center gap-1 pr-3 font-semibold text-primary"><ArrowLeft size={18} /> Retour à la séance</button>
            <h2 className="mb-3 mt-1 font-display text-[24px] font-semibold">{surahMeta(reader.surah).tr} · {rangeLabel(reader.surah, reader.from, reader.to).replace(/^Sourate \d+ — /, '')}</h2>
            <SessionReader item={reader} />
          </div>
        </div>,
        document.body,
      )}

      <footer className="pb-safe fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface">
        <div className="mx-auto max-w-[520px] px-4 pb-4 pt-3">
          {session.step === 'program' ? (
            <>
              <button className="btn-primary w-full" onClick={openEvaluation} disabled={total === 0}>Terminer la séance</button>
              <p className="mt-2 text-center text-xs text-muted">Travaille dans l’ordre de ton choix, puis évalue tout à l’étape suivante. Tu peux interrompre sans rien perdre.</p>
            </>
          ) : (
            <>
              <button className="btn-primary w-full" onClick={validate} disabled={decided < total}>Valider le bilan</button>
              <p className="mt-2 text-center text-xs text-muted">{decided < total ? 'Évalue chaque élément (ou « Non travaillé ») pour valider.' : 'Tu peux encore modifier une évaluation avant de valider.'}</p>
            </>
          )}
        </div>
      </footer>
    </div>
  );
}

// ------------------------------------------------------------------ Étape 1 : programme
function Program({ items, onReader }: { items: PlanItem[]; onReader: (it: PlanItem) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const [data, setData] = useState<QuranData | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!open || data) return;
    void loadQuranText().then((t) => (t ? setData(t) : setFailed(true)));
  }, [open, data]);
  const nf = new Intl.NumberFormat('ar-EG');

  return (
    <>
      <p className="mb-4 text-sm leading-relaxed text-muted">Voici tout ce qui est prévu. Travaille à ton rythme, avec ton Coran papier ou le Coran numérique de WIRD : rien ne t’interrompt, et WIRD n’écoute ni n’enregistre rien. Touche un élément pour voir le texte.</p>
      <ol className="space-y-2.5">
        {items.map((it, idx) => {
          const meta = surahMeta(it.surah);
          const isOpen = open === it.id;
          const verses = isOpen && data ? data.s[it.surah - 1].slice(it.from - 1, it.to) : null;
          const bas = isOpen && data && it.from === 1 ? basmalaFor(data, it.surah) : null;
          return (
            <li key={it.id} className="card overflow-hidden">
              <button className="flex w-full items-center gap-3 px-3.5 py-3.5 text-left" onClick={() => setOpen(isOpen ? null : it.id)} aria-expanded={isOpen}>
                <span className="w-5 text-center font-display text-lg font-semibold tabular-nums text-muted">{idx + 1}</span>
                <SurahNumber n={it.surah} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2"><span className="truncate text-[15px] font-semibold">{meta.tr}</span></span>
                  <span className="mt-0.5 block text-[13px] text-muted">{rangeLabel(it.surah, it.from, it.to).replace(/^Sourate \d+ — /, '')} · {formatPages(itemPages(it))}</span>
                  <span className="mt-1.5 block"><KindBadge kind={it.kind} /></span>
                </span>
                <span className="ar text-[26px] leading-none" lang="ar">{meta.ar}</span>
                <ChevronDown size={18} className={cx('shrink-0 text-muted transition', isOpen && 'rotate-180')} />
              </button>
              {isOpen && (
                <div className="animate-fade border-t border-line px-4 py-4" aria-label="Texte de référence">
                  {failed && <p className="text-sm text-muted">Le texte de référence n’a pas pu être chargé. Utilise ton Mushaf.</p>}
                  {!failed && !verses && <p className="text-sm text-muted">Chargement…</p>}
                  {bas && <p className="ar mb-2 text-center text-[24px] leading-[2] text-primary" lang="ar">{bas}</p>}
                  {verses && (
                    <p className="ar text-[28px] leading-[2.3]" lang="ar">
                      {verses.map((v, i) => (
                        <span key={i}>{v} <span className="text-primary">﴿{nf.format(it.from + i)}﴾</span>{' '}</span>
                      ))}
                    </p>
                  )}
                  <button className="btn-soft mt-3 !min-h-[40px] text-sm" onClick={() => onReader(it)}><BookOpen size={16} /> Ouvrir dans le Coran WIRD</button>
                  <p className="mt-3 text-[11px] leading-relaxed text-muted">Texte Tanzil (Uthmani Minimal 1.1, CC BY 3.0). Pour une récitation exacte, réfère-toi toujours à ton Mushaf.</p>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </>
  );
}

// ------------------------------------------------------------------ Étape 2 : évaluation
function Evaluate({ items, draft, onSet }: { items: PlanItem[]; draft: Record<string, DraftGrade>; onSet: (id: string, g: DraftGrade | null) => void }) {
  return (
    <ol className="space-y-3">
      {items.map((it, idx) => {
        const meta = surahMeta(it.surah);
        const d = draft[it.id];
        return (
          <li key={it.id} className={cx('card p-3.5 transition', d ? '' : 'border-primary/40')}>
            <div className="flex items-center gap-3">
              <span className="w-5 text-center font-display text-lg font-semibold tabular-nums text-muted">{idx + 1}</span>
              <SurahNumber n={it.surah} size={36} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold">{meta.tr}</p>
                <p className="text-[13px] text-muted">{rangeLabel(it.surah, it.from, it.to).replace(/^Sourate \d+ — /, '')}</p>
              </div>
              {d && d !== 'skip' && <GradeChip grade={d} />}
              {d === 'skip' && <span className="rounded-full bg-surface2 px-2.5 py-1 text-xs font-semibold text-muted">Non travaillé</span>}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2" role="radiogroup" aria-label={`Évaluation ${meta.tr}`}>
              {GRADE_ORDER.map((g) => (
                <button key={g} role="radio" aria-checked={d === g} onClick={() => { haptic('select'); onSet(it.id, d === g ? null : g); }} className={cx('flex min-h-[46px] items-center gap-2 rounded-lg border-2 px-3 text-left text-[13px] font-semibold transition active:scale-[.98]', d === g ? `${GRADE_STYLE[g].solid} border-transparent text-white` : `bg-bg ${GRADE_STYLE[g].ring}`)}>
                  {d === g ? <Check size={15} strokeWidth={3} /> : <span className={cx('h-2.5 w-2.5 rounded-full', GRADE_STYLE[g].solid)} />}
                  {GRADE_LABEL[g]}
                </button>
              ))}
            </div>
            <div className="mt-2 flex items-start justify-between gap-3">
              <p className="text-xs leading-snug text-muted">{d && d !== 'skip' ? GRADE_HINT[d] : d === 'skip' ? 'Rien n’est enregistré pour cet élément ; il reste dans la rotation.' : ' '}</p>
              <button onClick={() => onSet(it.id, d === 'skip' ? null : 'skip')} className="shrink-0 text-xs font-semibold text-primary underline-offset-4 hover:underline">{d === 'skip' ? 'Annuler' : 'Non travaillé'}</button>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function SessionReader({ item }: { item: PlanItem }) {
  const [page, setPage] = useState(pageOf(ayahId(item.surah, item.from)));
  const [mode, setMode] = useState<'page' | 'list'>('page');
  const [surah, setSurah] = useState<number | null>(item.surah);
  return <Reader page={page} onPage={setPage} onSurah={(n) => { setSurah(n); setMode('list'); }} surah={surah} mode={mode} onMode={(m) => { setMode(m); if (m === 'list') setSurah(item.surah); }} highlight={{ surah: item.surah, from: item.from, to: item.to }} />;
}
