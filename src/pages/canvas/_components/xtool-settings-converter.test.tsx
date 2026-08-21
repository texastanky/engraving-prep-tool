import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import XtoolSettingsConverterPanel from "./xtool-settings-converter.tsx";

const savedPresetsKey = "pgs-xtool-converter-saved-presets-v1";

describe("xTool settings converter", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("loads example LightBurn-style rows into XCS fields", async () => {
    const user = userEvent.setup();
    render(<XtoolSettingsConverterPanel />);

    await user.click(screen.getByRole("button", { name: /open full converter/i }));
    const dialog = await screen.findByRole("dialog");

    await user.click(within(dialog).getByRole("button", { name: /example/i }));

    expect(await within(dialog).findByText("Dark mark")).toBeInTheDocument();
    expect(within(dialog).getAllByText("Engrave / Fill").length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText("65-73").length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText("5000").length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText("12700").length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText("Fixed").length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText("On").length).toBeGreaterThan(0);
  });

  it("saves converted presets locally and loads them back in app", async () => {
    const user = userEvent.setup();
    render(<XtoolSettingsConverterPanel />);

    await user.click(screen.getByRole("button", { name: /open full converter/i }));
    const dialog = await screen.findByRole("dialog");

    await user.click(within(dialog).getByRole("button", { name: /example/i }));
    await within(dialog).findByText("Dark mark");
    await user.click(within(dialog).getByRole("button", { name: /save selected/i }));

    const saved = JSON.parse(localStorage.getItem(savedPresetsKey) || "[]");
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      material: "Aluminum",
      preset: "Dark mark",
      linesPerCm: "5000",
      dpi: "12700",
    });

    await user.click(within(dialog).getByRole("button", { name: /clear/i }));
    expect(within(dialog).queryByText("Dark mark")).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: /load saved/i }));
    expect(await within(dialog).findByText("Dark mark")).toBeInTheDocument();
  });

  it("saves more than one selected converted preset", async () => {
    const user = userEvent.setup();
    render(<XtoolSettingsConverterPanel />);

    await user.click(screen.getByRole("button", { name: /open full converter/i }));
    const dialog = await screen.findByRole("dialog");

    await user.click(within(dialog).getByRole("button", { name: /example/i }));
    await within(dialog).findByText("Dark mark");

    await user.click(within(dialog).getByRole("checkbox", { name: /select brass photo details/i }));
    await user.click(within(dialog).getByRole("button", { name: /save selected/i }));

    const saved = JSON.parse(localStorage.getItem(savedPresetsKey) || "[]");
    expect(saved).toHaveLength(2);
    expect(saved.map((preset: { preset: string }) => preset.preset)).toEqual([
      "Photo details",
      "Dark mark",
    ]);
  });
});
