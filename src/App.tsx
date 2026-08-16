import { BrowserRouter, HashRouter, Route, Routes } from "react-router-dom";
import { DefaultProviders } from "./components/providers/default.tsx";
import Index from "./pages/Index.tsx";
import CanvasPage from "./pages/canvas/page.tsx";
import NotFound from "./pages/NotFound.tsx";

export default function App() {
  const Router = window.location.protocol === "file:" ? HashRouter : BrowserRouter;

  return (
    <DefaultProviders>
      <Router>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/canvas" element={<CanvasPage />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Router>
    </DefaultProviders>
  );
}
