import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Nav } from './components/Nav';
import { ToastHost, cx } from './components/ui';
import { applyTheme, useOnline } from './lib/hooks';
import { useEdgeSwipeBack } from './lib/gestures';
import { listenInstall, registerPwa, usePwa } from './lib/pwa';
import { useWird } from './store/useWird';
import Home from './screens/Home';
import Onboarding from './screens/Onboarding';
import MonWird from './screens/wird/MonWird';
import Revisions from './screens/Revisions';
import Coran from './screens/Coran';
import KnownScreen from './screens/KnownScreen';
import Trash from './screens/profile/Trash';
import SurahDetail from './screens/wird/SurahDetail';
import ProgressTab from './screens/progress/ProgressTab';
import Profile from './screens/profile/Profile';
import ProfileEdit from './screens/profile/ProfileEdit';
import { ProfileNotifications, ProfileAbout } from './screens/profile/SubScreens';
import Session from './screens/session/Session';
import Bilan from './screens/session/Bilan';

const ROOTS = new Set(['/', '/wird', '/revisions', '/progression', '/profil']);

function RedirectSurah() {
  const { id } = useParams();
  return <Navigate to={`/wird/${id}`} replace />;
}

export default function App() {
  const ready = useWird((s) => s.ready);
  const loadError = useWird((s) => s.loadError);
  const onboarded = useWird((s) => s.profile.onboarded);
  const theme = useWird((s) => s.settings.theme);
  const ensureToday = useWird((s) => s.ensureToday);
  const online = useOnline();
  const { pathname } = useLocation();
  const nav = useNavigate();
  const { needRefresh, offlineReady, update, dismiss } = usePwa();

  useEffect(() => {
    registerPwa();
    listenInstall();
  }, []);
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);
  useEffect(() => {
    const onVis = () => document.visibilityState === 'visible' && ensureToday();
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [ensureToday]);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  // retour par glissement depuis le bord gauche (sauf onglets racines et séance)
  const sub = !ROOTS.has(pathname) && !pathname.startsWith('/session');
  useEdgeSwipeBack(sub ? () => nav(-1) : null, sub);

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
        <p className="text-muted">WIRD ne peut pas enregistrer tes données sur cet appareil ({loadError}). Désactive la navigation privée ou libère de l’espace, puis recharge.</p>
        <button className="btn-primary" onClick={() => location.reload()}>
          Recharger
        </button>
      </div>
    );
  }
  if (!onboarded) return <Onboarding />;

  const focus = pathname.startsWith('/session');
  const isRoot = ROOTS.has(pathname);
  const routeKey = pathname;
  return (
    <div className={cx(!focus && 'pb-24 lg:pb-0 lg:pl-60')}>
      {!online && !focus && (
        <div className="pt-safe bg-warn-soft px-4 py-2 text-center text-xs font-semibold text-warn" role="status">
          Hors connexion — tes données restent enregistrées sur l’appareil.
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
      <div key={routeKey} className={isRoot ? 'animate-rise' : 'animate-slide-in'}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/wird" element={<MonWird />} />
          <Route path="/wird/aujourdhui" element={<Navigate to="/revisions" replace />} />
          <Route path="/wird/apprentissage" element={<Navigate to="/revisions" replace />} />
          <Route path="/wird/sourates" element={<Navigate to="/wird" replace />} />
          <Route path="/wird/sourates/:id" element={<RedirectSurah />} />
          <Route path="/wird/:id" element={<SurahDetail />} />
          <Route path="/coran" element={<Coran />} />
          <Route path="/connues" element={<KnownScreen />} />
          <Route path="/revisions" element={<Revisions />} />
          <Route path="/progression" element={<ProgressTab />} />
          <Route path="/progression/*" element={<Navigate to="/progression" replace />} />
          <Route path="/profil" element={<Profile />} />
          <Route path="/profil/wird" element={<Navigate to="/profil" replace />} />
          <Route path="/profil/donnees" element={<Navigate to="/profil" replace />} />
          <Route path="/profil/profil" element={<ProfileEdit />} />
          <Route path="/profil/notifications" element={<ProfileNotifications />} />
          <Route path="/profil/corbeille" element={<Trash />} />
          <Route path="/profil/apropos" element={<ProfileAbout />} />
          <Route path="/session" element={<Session />} />
          <Route path="/session/bilan" element={<Bilan />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
      {!focus && <Nav />}
      <ToastHost />
    </div>
  );
}
