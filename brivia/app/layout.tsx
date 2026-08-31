import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "Brivia — Care Connected, Payments Simplified",
  description:
    "A transparent, interoperable platform for coordinating healthcare payments between providers, patients, and contributors. Powered by Open Payments / Interledger.",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Toaster position="top-right" richColors />
        {children}
      </body>
    </html>
  );
}
