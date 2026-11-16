import { BookOpen, ChartNoAxesColumn, House, RefreshCw, UserRound } from 'lucide-react';
import { haptic } from '@/lib/haptics';
import { NavLink } from 'react-router-dom';
import { cx } from './ui';

const TABS = [
  { to: '/', label: 'Accueil', icon: House, end: true },
  { to: '/wird', label: 'Mon Wird', icon: BookOpen, end: false },
  { to: '/revisions', label: 'Révisions', icon: RefreshCw, end: false },
  { to: '/progression', label: 'Progression', icon: ChartNoAxesColumn, end: false },
  { to: '/profil', label: 'Profil', icon: UserRound, end: false },
];

export function Nav() {
  return (
    <nav aria-label="Navigation principale" className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface lg:inset-y-0 lg:left-0 lg:right-auto lg:w-60 lg:border-r lg:border-t-0 lg:bg-surface lg:p-5">
      <p className="mb-8 mt-3 hidden px-3 font-display text-2xl font-semibold tracking-tight text-primary lg:block">WIRD</p>
      <ul className="mx-auto flex max-w-md items-stretch justify-around px-2 lg:max-w-none lg:flex-col lg:gap-1 lg:px-0">
        {TABS.map(({ to, label, icon: Icon, end }) => (
          <li key={to} className="flex-1 lg:flex-none">
            <NavLink
              to={to}
              end={end}
              onClick={() => haptic('tap')}
              className={({ isActive }) =>
                cx('group relative flex flex-col items-center gap-1 rounded-xl py-2.5 text-[11px] font-semibold transition lg:flex-row lg:gap-3 lg:px-3 lg:py-3 lg:text-sm', isActive ? 'font-bold text-primary lg:bg-soft' : 'text-muted hover:text-ink')
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={23} strokeWidth={isActive ? 2.1 : 1.7} aria-hidden />
                  <span>{label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
