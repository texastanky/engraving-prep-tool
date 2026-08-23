import { Download, RefreshCw, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button.tsx";
import {
  APP_VERSION,
  fetchUpdateManifest,
  getAvailableUpdate,
  isStandaloneUpdateSurface,
  resolveUpdateManifestUrl,
  type AvailableUpdate,
} from "@/lib/app-update.ts";

const dismissedUpdatePrefix = "engraving-prep-update-dismissed:";

function dismissedKey(version: string) {
  return `${dismissedUpdatePrefix}${version}`;
}

function hasDismissed(version: string) {
  try {
    return window.localStorage.getItem(dismissedKey(version)) === "1";
  } catch {
    return false;
  }
}

function dismissVersion(version: string) {
  try {
    window.localStorage.setItem(dismissedKey(version), "1");
  } catch {
    // Dismissal is a convenience only; the update notice can still work without storage.
  }
}

function openInstaller(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

export function UpdateNotifier() {
  const [availableUpdate, setAvailableUpdate] = useState<AvailableUpdate | null>(null);

  useEffect(() => {
    if (!isStandaloneUpdateSurface(window.location, window.navigator.userAgent)) return;

    const manifestUrl = resolveUpdateManifestUrl(window.location);
    if (!manifestUrl) return;

    const controller = new AbortController();

    const timer = window.setTimeout(async () => {
      try {
        const manifest = await fetchUpdateManifest(manifestUrl, controller.signal);
        const update = getAvailableUpdate(manifest, APP_VERSION, manifestUrl);

        if (!update || hasDismissed(update.latestVersion)) return;

        setAvailableUpdate(update);
        toast.info(`Engraving Prep Tool ${update.latestVersion} is available`, {
          action: {
            label: "Download",
            onClick: () => openInstaller(update.installerUrl),
          },
          description: `Installed version: ${update.currentVersion}`,
          duration: 12000,
        });
      } catch {
        // Update checks should never interrupt engraving work.
      }
    }, 1200);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, []);

  if (!availableUpdate) return null;

  const handleDismiss = () => {
    dismissVersion(availableUpdate.latestVersion);
    setAvailableUpdate(null);
  };

  return (
    <aside
      aria-label="Standalone update available"
      className="pointer-events-auto fixed bottom-4 right-4 z-[90] w-[min(360px,calc(100vw-2rem))] rounded-lg border border-primary/40 bg-popover p-3 text-popover-foreground shadow-2xl"
      data-update-notifier="available"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
          <RefreshCw className="size-4" />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="space-y-0.5">
            <p className="text-sm font-semibold leading-tight">Standalone update available</p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Version {availableUpdate.latestVersion} is ready. You have {availableUpdate.currentVersion}.
            </p>
            {availableUpdate.releaseNotes && (
              <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                {availableUpdate.releaseNotes}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button className="h-7 px-2 text-xs" size="sm" asChild>
              <a href={availableUpdate.installerUrl} rel="noreferrer" target="_blank">
                <Download className="size-3.5" />
                Download installer
              </a>
            </Button>
            <Button className="h-7 px-2 text-xs" size="sm" variant="ghost" onClick={handleDismiss}>
              Later
            </Button>
          </div>
        </div>
        <Button
          aria-label="Dismiss update notification"
          className="-mr-1 -mt-1"
          size="icon-xs"
          variant="ghost"
          onClick={handleDismiss}
        >
          <X className="size-3.5" />
        </Button>
      </div>
    </aside>
  );
}
