import { QueryClientProvider } from "./query-client.tsx";
import { Toaster } from "../ui/sonner.tsx";
import { TooltipProvider } from "../ui/tooltip.tsx";
import { UpdateNotifier } from "../update-notifier.tsx";

export function DefaultProviders({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider>
      <TooltipProvider>
        <Toaster />
        <UpdateNotifier />
        {children}
      </TooltipProvider>
    </QueryClientProvider>
  );
}
