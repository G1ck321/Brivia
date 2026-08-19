import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Brivia — Healthcare Payment Coordination",
  description:
    "A transparent, interoperable platform for coordinating healthcare payments between providers, patients, and contributors.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
