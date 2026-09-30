import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { PortalProvider } from "./state/PortalContext.jsx";
import { LibraryProvider } from "./state/LibraryContext.jsx";
import "./styles/global.css";

createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <PortalProvider>
      <LibraryProvider>
        <App />
      </LibraryProvider>
    </PortalProvider>
  </BrowserRouter>,
);
