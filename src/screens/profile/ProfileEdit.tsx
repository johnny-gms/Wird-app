import { useState } from 'react';
import { Avatar } from '@/components/Avatar';
import { SubPage, cx } from '@/components/ui';
import type { Gender } from '@/engine/types';
import { useWird } from '@/store/useWird';

/** Sous-page : toutes les informations de profil (prénom, âge, homme / femme → photo de profil). */
export default function ProfileEdit() {
  const { profile, updateProfile } = useWird();
  const [name, setName] = useState(profile.name);
  const [age, setAge] = useState(profile.age ? String(profile.age) : '');
  const opt: { v: Gender; label: string }[] = [{ v: 'male', label: 'Homme' }, { v: 'female', label: 'Femme' }];
  return (
    <SubPage title="Mon profil" back="/profil">
      <div className="flex justify-center"><Avatar gender={profile.gender} size={112} className="rounded-full" /></div>
      <div className="card mt-5 space-y-4 p-4">
        <label className="block">
          <span className="text-sm text-muted">Prénom</span>
          <input className="input mt-1.5" value={name} maxLength={40} autoComplete="given-name" onChange={(e) => setName(e.target.value)} onBlur={() => updateProfile({ name })} />
        </label>
        <label className="block">
          <span className="text-sm text-muted">Âge</span>
          <input className="input mt-1.5" inputMode="numeric" value={age} placeholder="Facultatif" onChange={(e) => setAge(e.target.value.replace(/\D/g, '').slice(0, 3))} onBlur={() => { const n = parseInt(age); updateProfile({ age: n >= 1 && n <= 120 ? n : null }); if (!(n >= 1 && n <= 120)) setAge(''); }} />
        </label>
        <div>
          <span className="text-sm text-muted">Je suis</span>
          <div className="mt-1.5 grid grid-cols-2 gap-3" role="radiogroup">
            {opt.map((o) => (
              <button key={o.v} role="radio" aria-checked={profile.gender === o.v} onClick={() => updateProfile({ gender: o.v })} className={cx('flex flex-col items-center gap-2 rounded-2xl border-2 bg-surface p-3 transition active:scale-[.98]', profile.gender === o.v ? 'border-primary' : 'border-line')}>
                <Avatar gender={o.v} size={64} className="rounded-full" />
                <span className="font-semibold">{o.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </SubPage>
  );
}
