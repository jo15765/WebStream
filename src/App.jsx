import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { usePortal } from "./state/PortalContext.jsx";
import { AppShell } from "./layout/AppShell.jsx";
import { PageLoader } from "./components/PageLoader.jsx";
import { LivePageSkeleton } from "./components/LivePageSkeleton.jsx";

const LoginPage = lazy(() =>
  import("./pages/LoginPage.jsx").then((m) => ({ default: m.LoginPage })),
);
const HomePage = lazy(() =>
  import("./pages/HomePage.jsx").then((m) => ({ default: m.HomePage })),
);
const LivePage = lazy(() =>
  import("./pages/LivePage.jsx").then((m) => ({ default: m.LivePage })),
);
const MoviesPage = lazy(() =>
  import("./pages/MoviesPage.jsx").then((m) => ({ default: m.MoviesPage })),
);
const SeriesPage = lazy(() =>
  import("./pages/SeriesPage.jsx").then((m) => ({ default: m.SeriesPage })),
);
const SeriesDetailPage = lazy(() =>
  import("./pages/SeriesDetailPage.jsx").then((m) => ({ default: m.SeriesDetailPage })),
);
const FavoritesPage = lazy(() =>
  import("./pages/FavoritesPage.jsx").then((m) => ({ default: m.FavoritesPage })),
);
const SearchPage = lazy(() =>
  import("./pages/SearchPage.jsx").then((m) => ({ default: m.SearchPage })),
);
const SettingsPage = lazy(() =>
  import("./pages/SettingsPage.jsx").then((m) => ({ default: m.SettingsPage })),
);
const LogInfoPage = lazy(() =>
  import("./pages/LogInfoPage.jsx").then((m) => ({ default: m.LogInfoPage })),
);

function Protected({ children }) {
  const { connected, loading } = usePortal();
  if (loading) {
    return (
      <div className="boot-screen">
        <div className="boot-logo">WebStream</div>
        <div className="page-loader-orbit boot-orbit" aria-hidden />
        <p>Checking your session…</p>
      </div>
    );
  }
  if (!connected) return <Navigate to="/login" replace />;
  return children;
}

function LazyPage({ children }) {
  return <Suspense fallback={<PageLoader />}>{children}</Suspense>;
}

export default function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <LazyPage>
            <LoginPage />
          </LazyPage>
        }
      />
      <Route
        path="/*"
        element={
          <Protected>
            <AppShell />
          </Protected>
        }
      >
        <Route
          index
          element={
            <LazyPage>
              <HomePage />
            </LazyPage>
          }
        />
        <Route
          path="live"
          element={
            <Suspense fallback={<LivePageSkeleton />}>
              <LivePage />
            </Suspense>
          }
        />
        <Route
          path="movies"
          element={
            <LazyPage>
              <MoviesPage />
            </LazyPage>
          }
        />
        <Route
          path="series"
          element={
            <LazyPage>
              <SeriesPage />
            </LazyPage>
          }
        />
        <Route
          path="series/:seriesId"
          element={
            <LazyPage>
              <SeriesDetailPage />
            </LazyPage>
          }
        />
        <Route
          path="favorites"
          element={
            <LazyPage>
              <FavoritesPage />
            </LazyPage>
          }
        />
        <Route
          path="search"
          element={
            <LazyPage>
              <SearchPage />
            </LazyPage>
          }
        />
        <Route
          path="settings"
          element={
            <LazyPage>
              <SettingsPage />
            </LazyPage>
          }
        />
        <Route
          path="logs"
          element={
            <LazyPage>
              <LogInfoPage />
            </LazyPage>
          }
        />
      </Route>
    </Routes>
  );
}
