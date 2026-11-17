import { ChevronRight, Info, SlidersHorizontal } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ProfileAvatar } from '@/components/Avatar';
import { Ring, Screen } from '@/components/ui';
import { addDays } from '@/engine/dates';
import { activeDaySet, activeDaysIn } from '@/engine/progress';
import { useToday } from '@/lib/hooks';
import { useMemo } from 'react';
import { useWird } from '@/store/useWird';

/** Profil : identité et accès. Les réglages sont dans Paramètres. */
export default function Profile() {
  const profile = useWird((s) => s.profile);
  const history = useWird((s) => s.history);
  const today = useToday();
  const active = useMemo(() => activeDaysIn(activeDaySet(history), addDays(today, -27), today), [history, today]);
  const pct = Math.round((active / 28) * 100);
  const level = active >= 20 ? 'Excellente' : active >= 10 ? 'Régulière' : active > 0 ? 'En route' : 'À démarrer';
  const row = 'card mt-3 flex items-center gap-3 p-4';
  return (
    <Screen title="Profil" sub="Toi et WIRD">
      <div className="kpi mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-[13px] font-semibold opacity-70">Ma régularité</p>
          <p className="mt-0.5 text-[26px] font-extrabold">{level}</p>
          <p className="mt-0.5 text-[13px] opacity-70">{active} jour{active > 1 ? 's' : ''} actif{active > 1 ? 's' : ''} sur 28</p>
        </div>
        <div className="text-white [&_circle:first-child]:stroke-white/15 [&_circle:last-child]:stroke-[#A9C4AE]"><Ring value={pct / 100} size={72} stroke={7}>{pct}%</Ring></div>
      </div>
      <Link to="/profil/profil" className="card flex items-center gap-4 p-4">
        <ProfileAvatar name={profile.name} gender={profile.gender} size={56} />
        <span className="min-w-0 flex-1"><b className="block truncate text-[17px]">{profile.name || 'Mon profil'}</b><span className="text-sm text-muted">Prénom, âge, photo de profil</span></span>
        <ChevronRight size={18} className="text-muted" />
      </Link>
      <Link to="/profil/parametres" className={row}><SlidersHorizontal size={20} className="text-primary" /><span className="flex-1"><b className="block">Paramètres</b><span className="text-sm text-muted">Mémorisation, apparence, rappels, sauvegardes</span></span><ChevronRight size={18} className="text-muted" /></Link>
      <Link to="/profil/apropos" className={row}><Info size={20} className="text-primary" /><span className="flex-1"><b className="block">À propos de WIRD</b><span className="text-sm text-muted">Sources du texte et licences</span></span><ChevronRight size={18} className="text-muted" /></Link>
    </Screen>
  );
}
