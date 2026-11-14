import { ChevronRight, Info, SlidersHorizontal } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ProfileAvatar } from '@/components/Avatar';
import { Screen } from '@/components/ui';
import { useWird } from '@/store/useWird';

/** Profil : identité et accès. Les réglages sont dans Paramètres. */
export default function Profile() {
  const profile = useWird((s) => s.profile);
  const row = 'card mt-3 flex items-center gap-3 p-4';
  return (
    <Screen title="Profil" sub="Toi et WIRD">
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
