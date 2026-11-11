import { ArrowLeft, Eye, EyeOff, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GRADE_HINT, GRADE_LABEL, GRADE_ORDER } from '@/engine/config';
import { rangeLabel, surahMeta } from '@/engine/quran';
import type { Grade } from '@/engine/types';
import { loadQuranText } from '@/lib/quranText';
import { useWird } from '@/store/useWird';
import { GRADE_STYLE, KindBadge, ProgressBar, cx, toast } from '@/components/ui';

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
  const { session, plan, startSession, finishRecitation, backToRecitation, submitGrade, skipCurrent } = useWird();
  const flush = useActiveTimer();
  const [show, setShow] = useState(false);
  const itemId = session?.currentItemId ?? null;
  const item = plan?.items.find((i) => i.id === itemId) ?? null;

  // Entrée sur l'écran : reprend la session ou en ouvre une.
  useEffect(() => {
    const st = useWird.getState();
    const cur = st.plan?.items.find((i) => i.id === st.session?.currentItemId);
    if (st.session && cur && cur.status !== 'done' && cur.status !== 'skipped') return;
    if (!startSession()) nav(st.plan?.items.length ? '/session/bilan' : '/', { replace: true });
  }, [nav, startSession]);

  useEffect(() => setShow(false), [itemId]);

  if (!session || !item || !plan) return null;
  const handled = plan.items.filter((i) => i.status === 'done' || i.status === 'skipped').length;
  const total = plan.items.length;
  const meta = surahMeta(item.surah);

  const after = (r: 'next' | 'finished') => {
    if (r === 'finished') nav('/session/bilan', { replace: true });
  };
  const evaluate = (g: Grade) => {
    flush();
    after(submitGrade(g));
  };
  const leave = () => {
    flush();
    toast('Travail enregistré — vous pourrez reprendre plus tard');
    nav('/', { replace: true });
  };

  return (
    <div className="pt-safe pb-safe mx-auto flex min-h-dvh w-full max-w-xl flex-col px-5">
      <header className="flex items-center gap-3 py-4">
        <button onClick={leave} aria-label="Interrompre" className="flex h-11 w-11 items-center justify-center rounded-full bg-surface2 text-muted">
          <X size={20} />
        </button>
        <div className="flex-1">
          <div className="mb-1 flex justify-between text-xs font-semibold text-muted">
            <span>Votre Wird du jour</span>
            <span className="tabular-nums">{Math.min(handled + 1, total)} / {total}</span>
          </div>
          <ProgressBar value={handled / total} />
        </div>
      </header>

      <main key={item.id + session.step} className="flex flex-1 animate-fade-up flex-col">
        {session.step === 'recite' ? (
          <Recite item={item} meta={meta} show={show} onToggle={() => setShow((v) => !v)} />
        ) : (
          <div className="flex flex-1 flex-col pt-1">
            <button onClick={backToRecitation} className="-ml-1 flex w-fit items-center gap-1.5 rounded-lg px-1 py-2 text-sm font-semibold text-muted">
              <ArrowLeft size={16} /> Retour à la récitation
            </button>
            <p className="mt-3 text-sm text-muted">
              {meta.tr} · {rangeLabel(item.surah, item.from, item.to).replace(/^Sourate \d+ — /, '')}
            </p>
            <h1 className="mb-5 mt-1 font-display text-2xl font-semibold leading-snug">Comment s’est passée votre récitation ?</h1>
            <div className="flex flex-col gap-2.5">
              {GRADE_ORDER.map((g, i) => (
                <button key={g} onClick={() => evaluate(g)} className={cx('flex items-center gap-4 rounded-2xl border-2 bg-surface p-4 text-left transition active:scale-[.985]', GRADE_STYLE[g].ring)}>
                  <span className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white', GRADE_STYLE[g].solid)}>{i + 1}</span>
                  <span>
                    <span className="block text-[16px] font-bold">{GRADE_LABEL[g]}</span>
                    <span className="mt-0.5 block text-[13px] leading-snug text-muted">{GRADE_HINT[g]}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </main>

      {session.step === 'recite' && (
        <footer className="flex flex-col gap-2 pb-5 pt-4">
          <button className="btn-primary w-full" onClick={finishRecitation}>
            J’ai terminé ma récitation
          </button>
          <button className="btn-ghost" onClick={() => after(skipCurrent())}>
            Passer cet élément
          </button>
        </footer>
      )}
    </div>
  );
}

function Recite({ item, meta, show, onToggle }: { item: { kind: 'review' | 'reinforce' | 'learn'; surah: number; from: number; to: number }; meta: ReturnType<typeof surahMeta>; show: boolean; onToggle: () => void }) {
  const [text, setText] = useState<string[][] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!show || text) return;
    void loadQuranText().then((t) => (t ? setText(t) : setFailed(true)));
  }, [show, text]);
  const verses = text ? text[item.surah - 1].slice(item.from - 1, item.to) : null;
  const nf = new Intl.NumberFormat('ar-EG');
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col items-center justify-center py-6 text-center">
        <KindBadge kind={item.kind} />
        <p className="ar mt-6 text-[44px] leading-tight" lang="ar">{meta.ar}</p>
        <h1 className="mt-2 font-display text-2xl font-semibold">{meta.tr}</h1>
        <p className="mt-3 text-lg font-semibold text-primary">{rangeLabel(item.surah, item.from, item.to)}</p>
        <p className="mt-5 max-w-xs text-sm leading-relaxed text-muted">Récitez de mémoire, à voix haute, avec votre propre Mushaf à portée de main. WIRD n’écoute ni n’enregistre rien.</p>
        <button onClick={onToggle} aria-pressed={show} className="btn-soft mt-6 min-h-[44px] text-sm">
          {show ? <EyeOff size={16} /> : <Eye size={16} />} {show ? 'Masquer le texte' : 'Afficher le texte de référence'}
        </button>
      </div>
      {show && (
        <section className="card mb-2 animate-fade-up p-5" aria-label="Texte de référence">
          {failed && <p className="text-sm text-muted">Le texte de référence n’a pas pu être chargé. Utilisez votre Mushaf.</p>}
          {!failed && !verses && <p className="text-sm text-muted">Chargement…</p>}
          {verses && (
            <p className="ar text-[28px] leading-[2.3]" lang="ar">
              {verses.map((v, i) => (
                <span key={i}>
                  {v} <span className="text-primary">﴿{nf.format(item.from + i)}﴾</span>{' '}
                </span>
              ))}
            </p>
          )}
          <p className="mt-3 text-[11px] text-muted">Texte uthmani — The Noble Qur’an Encyclopedia via quran-json (CC BY 4.0). Pour une récitation exacte, référez-vous toujours à votre Mushaf.</p>
        </section>
      )}
    </div>
  );
}
