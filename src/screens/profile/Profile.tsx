import { ChevronRight, Info, SlidersHorizontal } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ProfileAvatar } from '@/components/Avatar';
import { Screen } from '@/components/ui';
import { useWird } from '@/store/useWird';

/** Profil : un hadith sur la récompense du Coran, l'identité et les accès. Les réglages sont dans Paramètres. */
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
      <figure className="kpi mt-6 text-center" aria-label="Hadith sur la récompense du Coran">
        <p className="eyebrow text-[10.5px] font-bold uppercase tracking-[1.4px] opacity-70">Hadith</p>
        <blockquote>
          <p className="ar mt-3 text-[25px] leading-[1.9] text-[#F6F1E4]" lang="ar" dir="rtl">مَنْ قَرَأَ حَرْفًا مِنْ كِتَابِ اللَّهِ فَلَهُ بِهِ حَسَنَةٌ وَالْحَسَنَةُ بِعَشْرِ أَمْثَالِهَا</p>
          <p className="serif mt-3 text-[16px] italic leading-relaxed">« Celui qui lit une lettre du Livre d’Allah aura une bonne action, et chaque bonne action est multipliée par dix. »</p>
        </blockquote>
        <figcaption className="mt-3 text-[12.5px] opacity-65">Rapporté par at-Tirmidhi</figcaption>
      </figure>
    </Screen>
  );
}
