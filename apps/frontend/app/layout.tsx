import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bambam - Worms Zone MMO",
  description: "Multiplayer worm game",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr">
      <body style={{ margin: 0, padding: 0, overflow: "hidden", background: "#0a0a1a" }}>
        {children}
      </body>
    </html>
  );
}
