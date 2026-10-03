import { BrowserRouter, HashRouter, Route, Routes } from "react-router-dom";
import { LicenceGate } from "./components/licence-gate.tsx";
import { DefaultProviders } from "./components/providers/default.tsx";
import Landing from "./pages/Landing.tsx";
import CanvasPage from "./pages/canvas/page.tsx";
import NotFound from "./pages/NotFound.tsx";

export default function App() {
  const Router =
    window.location.protocol === "file:" ? HashRouter : BrowserRouter;

  return (
    <DefaultProviders>
      <Router>
        <Routes>
          {/* Public: the product page and anything that does not touch customer data. */}
          <Route path="/" element={<Landing />} />

          {/* The editor needs a valid licence key — there are no accounts. */}
          <Route
            path="/canvas"
            element={
              <LicenceGate>
                <CanvasPage />
              </LicenceGate>
            }
          />
          <Route
            path="/:locale/canvas"
            element={
              <LicenceGate>
                <CanvasPage />
              </LicenceGate>
            }
          />

          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Router>
    </DefaultProviders>
  );
}
