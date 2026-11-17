import { BookOpen, ChartNoAxesColumn, ChevronRight, House, Play, RefreshCw, UserRound } from 'lucide-react';
import { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { AddLearningSheet } from '@/components/AddLearningSheet';
import { Sheet, cx, toast } from '@/components/ui';
import { formatPages } from '@/engine/pages';
import { itemPages } from '@/engine/plan';
import { haptic } from '@/lib/haptics';
import { useWird } from '@/store/useWird';

const TABS = [
  { to: '/', label: 'Accueil', icon: House, match: (p: string) => p === '/' },
  { to: '/revisions', label: 'Mémoriser', icon: BookOpen, match: (p: string) => p.startsWith('/revisions') || p.startsWith('/wird') || p === '/coran' },
  { to: '/progression', label: 'Progression', icon: ChartNoAxesColumn, match: (p: string) => p.startsWith('/progression') },
  { to: '/profil', label: 'Profil', icon: UserRound, match: (p: string) => p.startsWith('/profil') || p === '/connues' },
];

/**
 * Barre d'onglets de la maquette : Accueil · Mémoriser · [Démarrer] · Progression · Profil.
 * Le bouton central ouvre « Que veux-tu faire ? » (séance du jour, révision libre, apprentissage).
 */
export function Nav() {
  const { pathname } = useLocation();
  const nav = useNavigate();
  const store = useWird();
  const [open, setOpen] = useState(false);
  const [add, setAdd] = useState(false);
  const pending = (store.plan?.items ?? []).filter((i) => i.status === 'pending');
  const pages = pending.reduce((a, i) => a + itemPages(i), 0);

  const startDay = () => {
    haptic('tap');
    setOpen(false);
    if (store.startSession()) nav('/session');
    else {
      toast('Rien au programme aujourd’hui');
      nav('/revisions');
    }
  };
  const tab = (t: (typeof TABS)[number]) => {
    const on = t.match(pathname);
    const Icon = t.icon;
    return (
      <NavLink
        key={t.to}
        to={t.to}
        onClick={() => haptic('tap')}
        aria-current={on ? 'page' : undefined}
        className={cx('flex flex-col items-center gap-[5px] rounded-xl px-1 py-1 text-[11px] font-semibold transition lg:flex-row lg:gap-3 lg:px-3 lg:py-3 lg:text-sm', on ? 'text-primary lg:bg-soft' : 'text-muted/80 hover:text-ink')}
      >
        <Icon size={23} strokeWidth={on ? 2.2 : 1.8} aria-hidden />
        <span>{tab_label(t)}</span>
      </NavLink>
    );
  };
  const tab_label = (t: (typeof TABS)[number]) => t.label;

  return (
    <>
      <nav aria-label="Navigation principale" className="pb-safe fixed inset-x-0 bottom-0 z-40 lg:inset-y-0 lg:left-0 lg:right-auto lg:w-60 lg:border-r lg:border-line lg:bg-surface lg:p-5">
        {/* mobile : barre arrondie avec bouton central */}
        <div className="mx-auto grid max-w-[520px] grid-cols-[1fr_1fr_76px_1fr_1fr] items-end rounded-t-[26px] border-t border-line bg-surface px-2.5 pb-2.5 pt-2.5 shadow-[0_-10px_30px_-20px_rgba(0,0,0,.25)] lg:hidden">
          {tab(TABS[0])}
          {tab(TABS[1])}
          <button className="fab mx-auto -mt-[30px] mb-2" aria-label="Démarrer" onClick={() => { haptic('tap'); setOpen(true); }}>
            <Play size={24} fill="currentColor" strokeWidth={0} className="ml-[3px]" />
          </button>
          {tab(TABS[2])}
          {tab(TABS[3])}
        </div>
        {/* bureau : barre latérale */}
        <div className="hidden lg:block">
          <p className="mb-8 mt-3 px-3 font-display text-2xl font-extrabold tracking-tight text-primary">WIRD</p>
          <button className="btn-primary mb-4 w-full" onClick={() => setOpen(true)}><Play size={16} fill="currentColor" strokeWidth={0} /> Démarrer</button>
          <div className="flex flex-col gap-1">{TABS.map(tab)}</div>
        </div>
      </nav>

      <Sheet open={open} onClose={() => setOpen(false)} title="Que veux-tu faire ?">
        <p className="mb-2 text-[13.5px] text-muted">Choisis ta séance, on s’occupe du reste.</p>
        <div className="flex flex-col gap-2.5 pb-2">
          <button className="glass-opt" onClick={startDay}>
            <span className="chip-ic ic-g"><Play size={21} /></span>
            <span className="min-w-0 flex-1"><b className="block text-[15px]">{store.session ? 'Reprendre ma séance' : 'Séance du jour'}</b><small className="text-[12.5px] text-muted">{pending.length ? `${pending.length} passage${pending.length > 1 ? 's' : ''} · ≈ ${formatPages(pages)}` : 'Rien au programme pour le moment'}</small></span>
            <ChevronRight size={18} className="text-muted/70" />
          </button>
          <button className="glass-opt" onClick={() => { setOpen(false); nav('/wird'); }}>
            <span className="chip-ic ic-a"><RefreshCw size={21} /></span>
            <span className="min-w-0 flex-1"><b className="block text-[15px]">Réviser</b><small className="text-[12.5px] text-muted">Choisis les sourates et les versets</small></span>
            <ChevronRight size={18} className="text-muted/70" />
          </button>
          <button className="glass-opt" onClick={() => { setOpen(false); setAdd(true); }}>
            <span className="chip-ic ic-b"><BookOpen size={21} /></span>
            <span className="min-w-0 flex-1"><b className="block text-[15px]">Apprendre</b><small className="text-[12.5px] text-muted">Choisis une sourate ou des versets à apprendre</small></span>
            <ChevronRight size={18} className="text-muted/70" />
          </button>
        </div>
      </Sheet>
      <AddLearningSheet open={add} onClose={() => setAdd(false)} />
    </>
  );
}
