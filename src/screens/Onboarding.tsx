import { useState } from 'react';
import { useWird } from '@/store/useWird';

export default function Onboarding() {
  const complete = useWird((s) => s.completeOnboarding);
  const [name, setName] = useState('');
  return (
    <div className="pt-safe pb-safe mx-auto flex min-h-dvh max-w-md flex-col px-6">
      <div className="flex flex-1 flex-col justify-center py-10">
        <p className="font-display text-5xl font-semibold tracking-tight text-primary">WIRD</p>
        <p className="ar mt-1 text-right text-3xl text-primary/70" lang="ar">
          وِرْد
        </p>
        <h1 className="mt-8 font-display text-2xl font-semibold leading-snug">Entretenir ce que vous avez mémorisé, avec régularité.</h1>
        <ul className="mt-5 space-y-3 text-[15px] leading-relaxed text-muted">
          <li>
            <b className="text-ink">La régularité</b> plutôt que la quantité.
          </li>
          <li>
            <b className="text-ink">La consolidation</b> plutôt que l’accumulation.
          </li>
          <li>
            <b className="text-ink">L’encouragement</b> plutôt que la culpabilisation : aucune dette de travail après une absence.
          </li>
        </ul>
        <label className="mt-8 block">
          <span className="label">Votre prénom (facultatif)</span>
          <input className="input mt-2" value={name} onChange={(e) => setName(e.target.value)} placeholder="Pour une salutation personnalisée" autoComplete="given-name" maxLength={40} />
        </label>
      </div>
      <div className="flex flex-col gap-2 pb-6">
        <button className="btn-primary" onClick={() => complete(name, false)}>
          Commencer
        </button>
        <button className="btn-outline" onClick={() => complete(name, true)}>
          Essayer avec des données de démonstration
        </button>
        <p className="mt-2 text-center text-xs leading-relaxed text-muted">Aucun compte requis. Vos données restent sur cet appareil. Les données de démonstration sont clairement identifiées et effaçables à tout moment.</p>
      </div>
    </div>
  );
}
