import { ArrowLeft, Check, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GradeChip, Sheet, KindBadge, SurahNumber, cx, toast, GRADE_STYLE } from '@/components/ui';
import { GRADE_HINT, GRADE_LABEL, GRADE_ORDER } from '@/engine/config';
import { itemSig } from '@/engine/plan';
import { rangeLabel, surahMeta, versesText } from '@/engine/quran';
import type { DraftGrade, PlanItem } from '@/engine/types';
import { haptic } from '@/lib/haptics';
import { useWird } from '@/store/useWird';
import { ChooseMode, PhoneProgram, PhoneWork, mushafRef } from './Phone';

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
  const { session, plan, startSession, openEvaluation, backToProgram, setDraft, validateSession, chooseMode, setPhone, setCurrent } = useWird();
  const flush = useActiveTimer();
  const [confirmEnd, setConfirmEnd] = useState(false);

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
  const mode = session.mode ?? 'mushaf';
  const phone = session.phone ?? {};
  const isDone = (i: PlanItem) => !!phone[itemSig(i)]?.done;
  // mode Téléphone : seuls les passages travaillés sont évalués ; les autres reviennent à la prochaine séance
  const evalItems = mode === 'phone' ? items.filter(isDone) : items;
  const remaining = mode === 'phone' ? items.filter((i) => !isDone(i)) : [];
  const total = items.length;
  const nVerses = items.reduce((a, i) => a + (i.to - i.from + 1), 0);
  const decided = evalItems.filter((i) => session.draft[i.id]).length;
  const extra = session.kind === 'extra';
  const current = session.current ? items.find((i) => itemSig(i) === session.current) ?? null : null;
  const choosing = session.step === 'choose';

  const leave = () => {
    flush();
    toast('Séance enregistrée — tu pourras la reprendre');
    nav('/', { replace: true });
  };
  // « Terminer ma séance » : en mode Téléphone, confirmation s'il reste des passages à travailler
  const finish = () => {
    if (mode === 'phone' && remaining.length > 0) setConfirmEnd(true);
    else openEvaluation();
  };
  const validate = () => {
    flush();
    const ms = useWird.getState().session?.activeMs ?? 0;
    const ids = evalItems.map((i) => i.id);
    const r = validateSession();
    if (r === 'bilan') {
      haptic('success');
      nav('/session/bilan', { replace: true, state: extra ? { extra: { ms, ids } } : undefined });
      toast('Séance validée', { label: 'Annuler', onClick: () => { if (useWird.getState().undoValidation()) nav('/session', { replace: true }); } });
    } else {
      nav('/', { replace: true });
      toast('Aucun élément évalué — rien n’est enregistré');
    }
  };

  const title = choosing ? 'Comment veux-tu travailler ?' : session.step === 'program' ? (extra ? 'Séance supplémentaire' : 'Travail des passages') : 'Bilan de la séance';
  const subtitle = choosing
    ? 'Choisis ton mode de travail pour cette séance.'
    : session.step === 'program'
      ? `${total} passage${total > 1 ? 's' : ''} · ${versesText(nVerses)}${extra && session.minutes ? ` · environ ${session.minutes} min (indicatif)` : ''}`
      : `Comment s’est passé chaque passage ? ${decided} / ${evalItems.length}`;

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="pt-safe mx-auto w-full max-w-[520px] px-4 pt-3">
        <div className="flex items-center justify-between">
          {session.step !== 'evaluate' ? (
            <button onClick={leave} className="-ml-1 flex min-h-[40px] items-center gap-1 pr-3 font-semibold text-primary"><X size={18} /> Interrompre</button>
          ) : (
            <button onClick={backToProgram} className="-ml-1 flex min-h-[40px] items-center gap-1 pr-3 font-semibold text-primary"><ArrowLeft size={18} /> Retour au programme</button>
          )}
          {session.step === 'program' && current ? (
            <button onClick={finish} className="text-sm font-semibold text-primary">Terminer ma séance</button>
          ) : (
            <span className="text-xs font-semibold text-muted">{choosing ? '' : session.step === 'program' ? 'Étape 1 / 2' : 'Étape 2 / 2'}</span>
          )}
        </div>
        <h1 className="title-page mb-1 mt-2">{title}</h1>
        <p className="text-sm text-muted">{subtitle}</p>
      </header>

      <main className="mx-auto w-full max-w-[520px] flex-1 px-4 pb-40 pt-4">
        {choosing ? (
          <ChooseMode onChoose={chooseMode} />
        ) : session.step === 'program' ? (
          mode === 'phone' ? (
            current ? <PhoneWork item={current} progress={phone[itemSig(current)] ?? { shown: 1, hidden: false, done: false }} onChange={(patch) => setPhone(itemSig(current), patch)} onClose={() => setCurrent(null)} /> : <PhoneProgram items={items} phone={phone} onOpen={(it) => setCurrent(itemSig(it))} />
          ) : (
            <Program items={items} />
          )
        ) : (
          <Evaluate items={evalItems} draft={session.draft} onSet={setDraft} remaining={remaining} />
        )}
      </main>

      <Sheet open={confirmEnd} onClose={() => setConfirmEnd(false)} title="Terminer ma séance ?">
        <p className="mb-5 text-[15px] leading-relaxed text-muted">{`Il te reste encore ${remaining.length} passage${remaining.length > 1 ? 's' : ''} à travailler. Tu peux terminer maintenant. Les passages restants pourront être reportés à ta prochaine séance.`}</p>
        <div className="flex flex-col gap-2">
          <button className="btn-primary" onClick={() => setConfirmEnd(false)}>Continuer ma séance</button>
          <button className="btn-soft" onClick={() => { setConfirmEnd(false); openEvaluation(); }}>Terminer quand même</button>
        </div>
      </Sheet>

      {!choosing && !current && (
        <footer className="pb-safe fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface">
          <div className="mx-auto max-w-[520px] px-4 pb-4 pt-3">
            {session.step === 'program' ? (
              <>
                <button className="btn-primary w-full" onClick={finish} disabled={total === 0}>Terminer ma séance</button>
                <p className="mt-2 text-center text-xs text-muted">{mode === 'mushaf' ? 'Travaille dans l’ordre de ton choix sur ton Mushaf, puis évalue à l’étape suivante.' : 'Travaille les passages dans l’ordre de ton choix.'} Tu peux interrompre à tout moment : ta séance est conservée.</p>
              </>
            ) : (
              <>
                <button className="btn-primary w-full" onClick={validate} disabled={decided < evalItems.length}>{evalItems.length === 0 ? 'Fermer la séance' : 'Valider le bilan'}</button>
                <p className="mt-2 text-center text-xs text-muted">{evalItems.length === 0 ? 'Aucun passage travaillé : rien n’est enregistré.' : decided < evalItems.length ? 'Évalue chaque passage (ou « Non travaillé ») pour valider.' : 'Tu peux encore modifier une évaluation avant de valider.'}</p>
              </>
            )}
          </div>
        </footer>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Étape 1 : programme
/** Mode Mushaf : seulement les références (sourate, versets, page, Juz). Le texte n'est pas affiché, l'utilisateur travaille sur son Mushaf. */
function Program({ items }: { items: PlanItem[] }) {
  return (
    <>
      <p className="mb-4 text-sm leading-relaxed text-muted">Voici ta feuille de route : tout ce qui est prévu, avec les références de ton Mushaf. Travaille à ton rythme sur ton Coran papier : rien ne t’interrompt, et WIRD n’écoute ni n’enregistre rien.</p>
      <ol className="space-y-2.5">
        {items.map((it, idx) => {
          const meta = surahMeta(it.surah);
          return (
            <li key={it.id} className="card flex items-center gap-3 px-3.5 py-3.5">
              <span className="w-5 text-center text-lg font-bold tabular-nums text-muted">{idx + 1}</span>
              <SurahNumber n={it.surah} size={40} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold">{meta.tr}</span>
                <span className="mt-0.5 block text-[13px] text-muted">{rangeLabel(it.surah, it.from, it.to).replace(/^Sourate \d+ — /, '')} · {mushafRef(it)} · {versesText(it.to - it.from + 1)}</span>
                <span className="mt-1.5 block"><KindBadge kind={it.kind} /></span>
              </span>
              <span className="ar text-[26px] leading-none" lang="ar">{meta.ar}</span>
            </li>
          );
        })}
      </ol>
    </>
  );
}

// ------------------------------------------------------------------ Étape 2 : évaluation
function Evaluate({ items, draft, onSet, remaining = [] }: { items: PlanItem[]; draft: Record<string, DraftGrade>; onSet: (id: string, g: DraftGrade | null) => void; remaining?: PlanItem[] }) {
  return (
    <>
    {items.length === 0 && <p className="card p-4 text-sm text-muted">Aucun passage n’a été travaillé pendant cette séance. Rien n’est enregistré, et rien n’est perdu : tes passages reviendront au programme.</p>}
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
    {remaining.length > 0 && (
      <section className="mt-6" aria-label="Passages restants">
        <h2 className="label mb-2">Passages restants ({remaining.length})</h2>
        <ul className="card divide-y divide-line">
          {remaining.map((it) => (
            <li key={it.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <span className="min-w-0 flex-1"><b className="block truncate">{surahMeta(it.surah).tr}</b><span className="text-muted">{rangeLabel(it.surah, it.from, it.to).replace(/^Sourate \d+ — /, '')}</span></span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs leading-relaxed text-muted">Ces passages sont reportés automatiquement : ils te seront proposés à ta prochaine séance, sans rien perdre ni rien devoir.</p>
      </section>
    )}
    </>
  );
}
