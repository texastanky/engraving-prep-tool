import { BrowserRouter, HashRouter, Route, Routes } from "react-router-dom";
import { AccountGate } from "./components/account-gate.tsx";
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

          {/* The editor needs an account, so only these routes sit behind the gate. */}
          <Route
            path="/canvas"
            element={
              <AccountGate>
                <CanvasPage />
              </AccountGate>
            }
          />
          <Route
            path="/:locale/canvas"
            element={
              <AccountGate>
                <CanvasPage />
              </AccountGate>
            }
          />

          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Router>
    </DefaultProviders>
  );
}
