import { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/components/ui';
import { haptic } from '@/lib/haptics';

const COLORS = ['#2F7A55', '#5CCB8C', '#DF9638', '#E36A48', 'rgb(var(--glory))', '#5B86C5'];

/** Pastille de confettis autour du badge : cercles, anneaux, carrés, traits (formes simples, couleurs de l'app). */
function Confetti() {
  const parts = useMemo(
    () =>
      Array.from({ length: 30 }, (_, i) => {
        const ang = (i / 30) * Math.PI * 2 + (((i * 37) % 10) / 10) * 0.4;
        const dist = 72 + ((i * 53) % 50);
        const sz = 4 + ((i * 7) % 7);
        const c = COLORS[i % COLORS.length];
        const t = i % 4;
        const shape =
          t === 0 ? { width: sz, height: sz, borderRadius: 9999, background: c }
          : t === 1 ? { width: sz + 3, height: sz + 3, borderRadius: 9999, border: `2px solid ${c}` }
          : t === 2 ? { width: sz, height: sz, borderRadius: 2, background: c }
          : { width: sz + 7, height: 2.5, borderRadius: 2, background: c };
        return { shape, x: Math.cos(ang) * dist, y: Math.sin(ang) * dist * 0.85, r: (i * 47) % 180, delay: 0.35 + ((i * 13) % 20) / 100 };
      }),
    [],
  );
  return (
    <>
      {parts.map((p, i) => (
        <i
          key={i}
          aria-hidden
          className="absolute left-1/2 top-1/2 block opacity-0"
          style={{ ...p.shape, ['--x' as string]: `${p.x}px`, ['--y' as string]: `${p.y}px`, ['--r' as string]: `${p.r}deg`, animation: `cgBurst 0.9s cubic-bezier(.2,.8,.2,1) ${p.delay}s forwards` }}
        />
      ))}
    </>
  );
}

/** Dernier écran de la séance : félicitations animées, puis retour automatique à l'accueil (ou d'un tap). */
export default function Congrats() {
  const nav = useNavigate();
  useEffect(() => {
    haptic('success');
    useToast.getState().hide();
    const t = setTimeout(() => nav('/', { replace: true }), 4200);
    return () => clearTimeout(t);
  }, [nav]);
  // Portail : la route est animée (transform) et ne doit pas servir de repère à l'écran plein cadre.
  return createPortal(
    <div role="button" tabIndex={0} aria-label="Retour à l’accueil" onClick={() => nav('/', { replace: true })} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && nav('/', { replace: true })} className="pt-safe pb-safe fixed inset-0 z-[70] flex flex-col items-center justify-center bg-bg px-8 text-center">
      <div className="relative grid h-[220px] w-[240px] place-items-center">
        <Confetti />
        <div className="grid h-[104px] w-[104px] place-items-center rounded-full" style={{ background: 'linear-gradient(140deg,#1D4A37 0%,#2F7A55 55%,rgb(var(--glory)) 125%)', boxShadow: '0 18px 36px -14px rgba(29,74,55,.6)', animation: 'cgPop .6s cubic-bezier(.2,1.6,.4,1) both' }}>
          <svg viewBox="0 0 24 24" className="h-[46px] w-[46px]" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="m6 12.5 4 4L18 8" style={{ strokeDasharray: 30, strokeDashoffset: 30, animation: 'cgDraw .5s .45s ease forwards' }} />
          </svg>
        </div>
      </div>
      <h1 className="text-[34px] font-extrabold tracking-[-0.8px] text-ink" style={{ animation: 'cgRise .5s .5s ease both' }}>Félicitations !</h1>
      <p className="mt-2.5 max-w-[290px] text-[17px] leading-snug text-muted" style={{ animation: 'cgRise .5s .65s ease both' }}>Ta séance du jour est terminée. Qu’Allah accepte ton effort.</p>
    </div>,
    document.body,
  );
}
