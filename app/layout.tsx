import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Daily Links",
  description: "Shared job application tracker",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
