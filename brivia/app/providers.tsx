"use client";

import { Toaster } from "sonner";

export function BriviaProviders({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Toaster position="top-right" richColors />
      {children}
    </>
  );
}
