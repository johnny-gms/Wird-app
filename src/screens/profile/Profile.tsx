import { Bell, ChevronRight, Database, Info, Moon, SlidersHorizontal, Sun, Smartphone } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Row, Screen, Segmented } from '@/components/ui';
import { isIOS, isStandalone, useInstall } from '@/lib/pwa';
import { useWird } from '@/store/useWird';
import { APP_VERSION } from '@/lib/version';
import type { ThemeMode } from '@/engine/types';
import { useState } from 'react';

export default function Profile() {
  const { profile, setName, settings, updateSettings } = useWird();
  const install = useInstall((s) => s.event);
  const [name, setN] = useState(profile.name);
  const standalone = isStandalone();

  return (
    <Screen title="Profil" sub="Réglages et confidentialité">

      <section className="card p-5">
        <label>
          <span className="label">Prénom</span>
          <input className="input mt-2" value={name} placeholder="Facultatif" maxLength={40} onChange={(e) => setN(e.target.value)} onBlur={() => setName(name)} autoComplete="given-name" />
        </label>
        <p className="mt-2 text-xs text-muted">Utilisé uniquement pour la salutation. Il ne quitte pas votre appareil. Aucun compte n’est requis.</p>
      </section>

      {!standalone && (
        <section className="card mt-3 flex items-start gap-3 p-4">
          <Smartphone className="mt-0.5 shrink-0 text-primary" size={22} />
          <div className="text-sm">
            <p className="font-semibold">Installer WIRD</p>
            {isIOS() ? (
              <p className="mt-1 leading-relaxed text-muted">Dans Safari, touchez <b>Partager</b> puis <b>Sur l’écran d’accueil</b>. WIRD s’ouvrira alors en plein écran, hors connexion comprise.</p>
            ) : install ? (
              <button className="btn-soft mt-2 min-h-[40px]" onClick={() => void install.prompt()}>Installer sur cet appareil</button>
            ) : (
              <p className="mt-1 leading-relaxed text-muted">Utilisez le menu de votre navigateur : « Installer l’application » ou « Ajouter à l’écran d’accueil ».</p>
            )}
          </div>
        </section>
      )}

      <h2 className="label mb-2 mt-6">Apparence</h2>
      <section className="card p-4">
        <Segmented<ThemeMode> value={settings.theme} onChange={(theme) => updateSettings({ theme })} options={[{ value: 'light', label: 'Clair' }, { value: 'system', label: 'Auto' }, { value: 'dark', label: 'Sombre' }]} />
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">{settings.theme === 'dark' ? <Moon size={13} /> : <Sun size={13} />} « Auto » suit les réglages de votre appareil.</p>
      </section>

      <h2 className="label mb-2 mt-6">Réglages</h2>
      <ul className="card divide-y divide-line/60 overflow-hidden">
        <NavRow to="/profil/wird" icon={<SlidersHorizontal size={20} />} title="Paramètres du Wird" sub={`${settings.learnPagesPerDay ? `${settings.learnPagesPerDay} p. à apprendre` : 'Pas d’apprentissage'} · ${settings.reviewPagesPerDay} p. à réviser par jour`} />
        <NavRow to="/profil/notifications" icon={<Bell size={20} />} title="Notifications" sub="Rappels, horaires et autorisation" />
        <NavRow to="/profil/donnees" icon={<Database size={20} />} title="Données et confidentialité" sub="Export, import, remise à zéro" />
        <NavRow to="/profil/apropos" icon={<Info size={20} />} title="À propos de WIRD" sub={`Version ${APP_VERSION}`} />
      </ul>
      <p className="mt-6 text-center text-xs text-muted">WIRD {APP_VERSION}{profile.demo ? ' · données de démonstration' : ''}</p>
    </Screen>
  );
}

function NavRow({ to, icon, title, sub }: { to: string; icon: React.ReactNode; title: string; sub: string }) {
  return (
    <li>
      <Link to={to}>
        <Row className="active:bg-surface2">
          <span className="text-primary">{icon}</span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold">{title}</span>
            <span className="block truncate text-xs text-muted">{sub}</span>
          </span>
          <ChevronRight size={18} className="text-muted" />
        </Row>
      </Link>
    </li>
  );
}
