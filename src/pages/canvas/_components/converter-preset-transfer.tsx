import { Button } from "@/components/ui/button.tsx";
import { toast } from "sonner";

export default function ConverterPresetTransfer() {
  function exportPresets() {
    try {
      const presets = JSON.parse(
        localStorage.getItem("pgs-xtool-converter-saved-presets-v1") || "[]",
      );
      if (!Array.isArray(presets) || !presets.length) {
        toast.info("No saved converter presets on this browser.");
        return;
      }
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(presets, null, 2)], { type: "application/json" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = "xtool-saved-presets.json";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Could not export saved converter presets. Your stored data has not been changed.");
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card p-4 space-y-2">
      <h2 className="text-xs font-medium">Settings converter moved</h2>
      <p className="text-[10px] text-muted-foreground">
        Settings conversion now lives in the separate xTool Settings Converter app.
        Download any presets saved here, import the JSON file there, then choose Save All.
        The apps do not share browser storage.
      </p>
      <Button variant="secondary" size="sm" className="text-xs" onClick={exportPresets}>
        Download saved converter presets
      </Button>
    </section>
  );
}
