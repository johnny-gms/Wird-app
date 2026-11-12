import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Nav } from './components/Nav';
import { ToastHost, cx } from './components/ui';
import { applyTheme, useOnline } from './lib/hooks';
import { listenInstall, registerPwa, usePwa } from './lib/pwa';
import { useWird } from './store/useWird';
import Home from './screens/Home';
import Onboarding from './screens/Onboarding';
import WirdTab from './screens/wird/WirdTab';
import SurahDetail from './screens/wird/SurahDetail';
import ProgressTab from './screens/progress/ProgressTab';
import Profile from './screens/profile/Profile';
import { ProfileWird, ProfileNotifications, ProfileData, ProfileAbout } from './screens/profile/SubScreens';
import Session from './screens/session/Session';
import Bilan from './screens/session/Bilan';

export default function App() {
  const ready = useWird((s) => s.ready);
  const loadError = useWird((s) => s.loadError);
  const onboarded = useWird((s) => s.profile.onboarded);
  const theme = useWird((s) => s.settings.theme);
  const ensureToday = useWird((s) => s.ensureToday);
  const online = useOnline();
  const { pathname } = useLocation();
  const { needRefresh, offlineReady, update, dismiss } = usePwa();

  useEffect(() => {
    registerPwa();
    listenInstall();
  }, []);
  useEffect(() => applyTheme(theme), [theme]);
  useEffect(() => {
    const onVis = () => document.visibilityState === 'visible' && ensureToday();
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [ensureToday]);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  if (!ready) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <p className="animate-pulse font-display text-3xl font-semibold text-primary">WIRD</p>
      </div>
    );
  }
  if (loadError) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-3 px-6 text-center">
        <h1 className="font-display text-2xl font-semibold">Stockage indisponible</h1>
        <p className="text-muted">WIRD ne peut pas enregistrer vos données sur cet appareil ({loadError}). Désactivez la navigation privée ou libérez de l’espace, puis rechargez.</p>
        <button className="btn-primary" onClick={() => location.reload()}>
          Recharger
        </button>
      </div>
    );
  }
  if (!onboarded) return <Onboarding />;

  const focus = pathname.startsWith('/session');
  return (
    <div className={cx(!focus && 'pb-24 lg:pb-0 lg:pl-60')}>
      {!online && !focus && (
        <div className="pt-safe bg-warn-soft px-4 py-2 text-center text-xs font-semibold text-warn" role="status">
          Hors connexion — vos données restent enregistrées sur l’appareil.
        </div>
      )}
      {(needRefresh || offlineReady) && !focus && (
        <div className="mx-4 mt-3 flex items-center justify-between gap-3 rounded-xl bg-soft px-4 py-3 text-sm lg:mx-auto lg:max-w-2xl" role="status">
          <span className="font-medium text-primary">{needRefresh ? 'Une nouvelle version de WIRD est disponible.' : 'WIRD est prêt à fonctionner hors connexion.'}</span>
          <span className="flex gap-1">
            {needRefresh && (
              <button className="rounded-lg bg-primary px-3 py-1.5 font-semibold text-primary-ink" onClick={update}>
                Mettre à jour
              </button>
            )}
            <button className="rounded-lg px-3 py-1.5 font-semibold text-muted" onClick={dismiss}>
              OK
            </button>
          </span>
        </div>
      )}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/wird" element={<Navigate to="/wird/aujourdhui" replace />} />
        <Route path="/wird/sourates/:id" element={<SurahDetail />} />
        <Route path="/wird/:tab" element={<WirdTab />} />
        <Route path="/progression" element={<ProgressTab />} />
        <Route path="/progression/*" element={<Navigate to="/progression" replace />} />
        <Route path="/profil" element={<Profile />} />
        <Route path="/profil/wird" element={<ProfileWird />} />
        <Route path="/profil/notifications" element={<ProfileNotifications />} />
        <Route path="/profil/donnees" element={<ProfileData />} />
        <Route path="/profil/apropos" element={<ProfileAbout />} />
        <Route path="/session" element={<Session />} />
        <Route path="/session/bilan" element={<Bilan />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {!focus && <Nav />}
      <ToastHost />
    </div>
  );
}
