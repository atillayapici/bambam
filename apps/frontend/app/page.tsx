"use client";

import dynamic from "next/dynamic";

const GameClient = dynamic(() => import("@/components/GameClient"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        display: "flex",
        height: "100vh",
        alignItems: "center",
        justifyContent: "center",
        background: "#0a0a1a",
        color: "#00ff88",
        fontFamily: "monospace",
        fontSize: "1.5rem",
        flexDirection: "column",
        gap: "1rem",
      }}
    >
      <div style={{ fontSize: "3rem" }}>🐛</div>
      <div>Sunucuya Bağlanılıyor...</div>
    </div>
  ),
});

export default function Home() {
  return (
    <main
      style={{
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        margin: 0,
        padding: 0,
        background: "#0a0a1a",
      }}
    >
      <GameClient />
    </main>
  );
}
