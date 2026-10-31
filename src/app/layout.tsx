import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Quoridor — the wall-building race",
  description:
    "A neon Quoridor board game built with Next.js and TypeScript. Race your pawn to the far row while placing walls to lengthen your rival's route, but never seal it. Play a friend on one device or a CPU with Easy, Medium and Hard tiers.",
};

export const viewport: Viewport = {
  themeColor: "#070610",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
