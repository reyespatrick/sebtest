import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bitcoin · cours sur 10 ans & coût de minage",
  description:
    "Cours du bitcoin sur 10 ans (daily/weekly/yearly, bougies ou ligne) et coût de création par minage en Chine, en USD ou CHF.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
