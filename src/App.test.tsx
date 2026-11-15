import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import App from "./App.tsx";

vi.mock("./components/providers/default.tsx", () => ({
  DefaultProviders: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("./pages/canvas/page.tsx", () => ({
  default: () => <div>Engraving editor</div>,
}));
vi.mock("./pages/Landing.tsx", () => ({ default: () => <div>Product page</div> }));
vi.mock("./pages/NotFound.tsx", () => ({ default: () => <div>Not found</div> }));

describe("editor access", () => {
  it.each(["/canvas", "/es/canvas"])("opens %s without a licence", (path) => {
    window.localStorage.clear();
    window.history.replaceState({}, "", path);
    render(<App />);
    expect(screen.getByText("Engraving editor")).toBeInTheDocument();
    expect(screen.queryByText("Enter your licence key to continue")).not.toBeInTheDocument();
  });
});
