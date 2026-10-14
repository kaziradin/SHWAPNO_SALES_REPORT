import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Shwapno Business Performance",
  description: "Daily sales, growth and target achievement from the Business Performance Report.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
