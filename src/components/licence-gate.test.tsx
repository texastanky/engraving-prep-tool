import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { activateLicense, loadEntitlement, loadVerifiedEntitlement } from "@/lib/licensing.ts";
import { LicenceGate } from "./licence-gate.tsx";

vi.mock("@/lib/licensing.ts", () => ({
  activateLicense: vi.fn(),
  licenseErrorMessage: vi.fn(() => "That licence key was not issued by ForgeMark Industries."),
  loadEntitlement: vi.fn(() => null),
  loadVerifiedEntitlement: vi.fn(async () => null),
}));

const TEST_ENTITLEMENT = {
  token: "PGS2.test.key",
  sub: "buyer@example.com",
  plan: "pro" as const,
  label: "Pro",
  expiresAt: null,
  activatedAt: "2026-10-03T00:00:00.000Z",
};

describe("LicenceGate", () => {
  beforeEach(() => {
    vi.mocked(loadVerifiedEntitlement).mockReset();
    vi.mocked(loadVerifiedEntitlement).mockResolvedValue(null);
    vi.mocked(loadEntitlement).mockReset();
    vi.mocked(loadEntitlement).mockReturnValue(null);
    vi.mocked(activateLicense).mockReset();
  });

  it("asks for a licence key when none is stored", async () => {
    render(
      <LicenceGate>
        <div>editor surface</div>
      </LicenceGate>
    );

    expect(await screen.findByText("Enter your licence key to continue")).toBeInTheDocument();
    expect(screen.queryByText("editor surface")).not.toBeInTheDocument();
  });

  it("opens the editor when a stored key verifies", async () => {
    vi.mocked(loadVerifiedEntitlement).mockResolvedValue(TEST_ENTITLEMENT);

    render(
      <LicenceGate>
        <div>editor surface</div>
      </LicenceGate>
    );

    expect(await screen.findByText("editor surface")).toBeInTheDocument();
    expect(screen.queryByText("Enter your licence key to continue")).not.toBeInTheDocument();
  });

  it("explains a stored key that no longer verifies", async () => {
    vi.mocked(loadEntitlement).mockReturnValue(TEST_ENTITLEMENT);

    render(
      <LicenceGate>
        <div>editor surface</div>
      </LicenceGate>
    );

    expect(
      await screen.findByText(/licence saved on this machine is no longer valid/i)
    ).toBeInTheDocument();
    expect(screen.queryByText("editor surface")).not.toBeInTheDocument();
  });

  it("unlocks the editor when a pasted key activates", async () => {
    vi.mocked(activateLicense).mockResolvedValue({ ok: true, plan: "shop" });
    const user = userEvent.setup();

    render(
      <LicenceGate>
        <div>editor surface</div>
      </LicenceGate>
    );

    const input = await screen.findByLabelText(/licence key/i);
    await user.type(input, "PGS2.paste.me");
    await user.click(screen.getByRole("button", { name: /activate licence/i }));

    expect(await screen.findByText("editor surface")).toBeInTheDocument();
    expect(activateLicense).toHaveBeenCalledWith("PGS2.paste.me");
  });

  it("shows the reason a key was rejected and stays locked", async () => {
    vi.mocked(activateLicense).mockResolvedValue({ ok: false, error: "bad_signature" });
    const user = userEvent.setup();

    render(
      <LicenceGate>
        <div>editor surface</div>
      </LicenceGate>
    );

    const input = await screen.findByLabelText(/licence key/i);
    await user.type(input, "PGS2.forged.key");
    await user.click(screen.getByRole("button", { name: /activate licence/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/not issued by ForgeMark/i);
    expect(screen.queryByText("editor surface")).not.toBeInTheDocument();
  });
});
