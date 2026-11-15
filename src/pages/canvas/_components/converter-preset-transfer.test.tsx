import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import ConverterPresetTransfer from "./converter-preset-transfer.tsx";

vi.mock("sonner", () => ({ toast: { info: vi.fn(), error: vi.fn() } }));
const key = "pgs-xtool-converter-saved-presets-v1";

describe("saved converter preset transfer", () => {
  beforeEach(() => localStorage.clear());

  it("explains that the separate app does not share storage", () => {
    render(<ConverterPresetTransfer />);
    expect(screen.getByText(/apps do not share browser storage/i)).toBeInTheDocument();
    expect(screen.queryByText("Open full converter")).not.toBeInTheDocument();
  });

  it("exports saved presets without deleting or rewriting the originals", async () => {
    const presets = JSON.stringify([{ savedId: "test", material: "Aluminum", preset: "Test" }]);
    localStorage.setItem(key, presets);
    const create = vi.fn(() => "blob:test");
    vi.stubGlobal("URL", { createObjectURL: create, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    try {
      render(<ConverterPresetTransfer />);
      await userEvent.click(screen.getByRole("button", { name: /download saved converter presets/i }));
      expect(create).toHaveBeenCalledWith(expect.any(Blob));
      expect(click).toHaveBeenCalledOnce();
      expect(localStorage.getItem(key)).toBe(presets);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("reports an empty library without starting a download", async () => {
    render(<ConverterPresetTransfer />);
    await userEvent.click(screen.getByRole("button", { name: /download saved converter presets/i }));
    expect(toast.info).toHaveBeenCalledWith("No saved converter presets on this browser.");
  });

  it("leaves corrupt saved data untouched", async () => {
    localStorage.setItem(key, "{invalid");
    render(<ConverterPresetTransfer />);
    await userEvent.click(screen.getByRole("button", { name: /download saved converter presets/i }));
    expect(toast.error).toHaveBeenCalled();
    expect(localStorage.getItem(key)).toBe("{invalid");
  });
});
