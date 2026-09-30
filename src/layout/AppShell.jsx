import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { usePortal } from "../state/PortalContext.jsx";
import { catalog } from "../api/http.js";
import { fetchCatalog } from "../api/catalogCache.js";

function prefetchLive() {
  import("../pages/LivePage.jsx").catch(() => {});
  fetchCatalog(catalog, "get_live_categories").catch(() => {});
  fetchCatalog(catalog, "get_live_streams").catch(() => {});
}

const NAV = [
  { to: "/", label: "Home", end: true },
  { to: "/live", label: "Live TV" },
  { to: "/movies", label: "Movies" },
  { to: "/series", label: "Series" },
  { to: "/favorites", label: "Favorites" },
  { to: "/search", label: "Search" },
  { to: "/settings", label: "Settings" },
  { to: "/logs", label: "Logs & info" },
];

export function AppShell() {
  const { profile } = usePortal();
  const navigate = useNavigate();

  useEffect(() => {
    prefetchLive();
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        navigate("/search");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  return (
    <div className="app-frame">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden />
          WebStream
        </div>
        <nav className="sidebar-nav">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onMouseEnter={item.to === "/live" ? prefetchLive : undefined}
              onFocus={item.to === "/live" ? prefetchLive : undefined}
              className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <span className="muted">{profile?.userInfo?.username}</span>
        </div>
      </aside>
      <main className="main-pane">
        <Outlet />
      </main>
    </div>
  );
}
