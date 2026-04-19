"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

// NOTE: Do NOT import any @midnight-ntwrk/* module here.
// Midnight SDK modules (especially ledger-v8) call readFileSync at load time
// which crashes Next.js SSR.  Only import them inside async event handlers
// using dynamic import().

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: 1 },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
