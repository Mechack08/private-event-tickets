import type { Metadata } from "next";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Private Event Tickets",
  description:
    "Privacy-preserving event ticketing on Midnight Network. " +
    "Prove ticket ownership with zero-knowledge proofs — no identity revealed.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
