"use client";

import { BriviaDemoProvider } from "@/contexts/BriviaDemoContext";
import { Toaster } from "sonner";

export function BriviaProviders({ children }: { children: React.ReactNode }) {
  return (
    <BriviaDemoProvider>
      <Toaster position="top-right" richColors />
      {children}
    </BriviaDemoProvider>
  );
}
