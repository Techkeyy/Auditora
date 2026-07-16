import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Argus — the audit layer of Monad",
  description:
    "Paste any Monad contract address: three independent AI auditors review the real deployed code, a referee reconciles them, and the consensus verdict is attested onchain — bound to the contract's codehash. A public audit registry anyone can check.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&family=Space+Grotesk:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
