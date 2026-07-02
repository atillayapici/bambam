"use client";

import { useEffect, useRef, useState } from "react";
import * as PIXI from "pixi.js";
import { Client, Room } from "colyseus.js";

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL ||
  (typeof window !== "undefined" && window.location.hostname !== "localhost"
    ? "wss://bambam--atillayapici.replit.app"
    : "ws://localhost:2567");

type Status = "connecting" | "connected" | "error";

export default function GameClient() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const roomRef = useRef<Room | null>(null);
  const [status, setStatus] = useState<Status>("connecting");
  const [statusMsg, setStatusMsg] = useState("Sunucuya bağlanılıyor...");
  const [playerCount, setPlayerCount] = useState(0);

  useEffect(() => {
    if (!canvasRef.current) return;

    let app: PIXI.Application;
    let resizeHandler: () => void;
    let destroyed = false;

    const initApp = async () => {
      try {
        app = new PIXI.Application();
        await app.init({
          canvas: canvasRef.current!,
          width: window.innerWidth,
          height: window.innerHeight,
          backgroundColor: 0x0a0a1a,
          resolution: window.devicePixelRatio || 1,
          autoDensity: true,
        });

        // Grid
        const grid = new PIXI.Graphics();
        for (let x = 0; x <= 2000; x += 100) { grid.moveTo(x, 0); grid.lineTo(x, 2000); }
        for (let y = 0; y <= 2000; y += 100) { grid.moveTo(0, y); grid.lineTo(2000, y); }
        grid.stroke({ width: 1, color: 0x1a1a2e, alpha: 0.8 });
        grid.rect(0, 0, 2000, 2000);
        grid.stroke({ width: 6, color: 0x7b2d8b });
        app.stage.addChild(grid);

        const client = new Client(SERVER_URL);
        const playerGraphics = new Map<string, PIXI.Graphics>();

        try {
          setStatusMsg(`Bağlanılıyor → ${SERVER_URL}`);
          const room = await client.joinOrCreate("arena");
          roomRef.current = room;
          setStatus("connected");
          setStatusMsg(`✅ Bağlandı | ID: ${room.sessionId.slice(0, 8)}`);

          room.state.players.onAdd = (player: any, sessionId: string) => {
            const isMe = sessionId === room.sessionId;
            const g = new PIXI.Graphics();
            g.circle(0, 0, isMe ? 28 : 26);
            g.fill({ color: isMe ? 0x00ff88 : 0xff4444, alpha: 0.2 });
            g.circle(0, 0, isMe ? 22 : 20);
            g.fill({ color: isMe ? 0x00ff88 : 0xff4444 });
            g.circle(10, -6, 5); g.fill({ color: 0xffffff });
            g.circle(11, -6, 3); g.fill({ color: 0x000000 });
            g.x = player.x; g.y = player.y;
            app.stage.addChild(g);
            playerGraphics.set(sessionId, g);

            setPlayerCount(prev => prev + 1);

            if (isMe) {
              app.stage.pivot.x = player.x;
              app.stage.pivot.y = player.y;
              app.stage.position.x = app.screen.width / 2;
              app.stage.position.y = app.screen.height / 2;
            }

            player.onChange = (changes: any) => {
              const graphic = playerGraphics.get(sessionId);
              if (graphic) { graphic.x = player.x; graphic.y = player.y; graphic.rotation = player.currentAngle; }
              if (isMe) {
                app.stage.pivot.x = player.x;
                app.stage.pivot.y = player.y;
                app.stage.position.x = app.screen.width / 2;
                app.stage.position.y = app.screen.height / 2;
              }
            };
          };

          room.state.players.onRemove = (_player: any, sessionId: string) => {
            const g = playerGraphics.get(sessionId);
            if (g) { app.stage.removeChild(g); g.destroy(); playerGraphics.delete(sessionId); }
            setPlayerCount(prev => Math.max(0, prev - 1));
          };

        } catch (e: any) {
          setStatus("error");
          setStatusMsg(`❌ Bağlantı hatası: ${e?.message || "Sunucu çevrimdışı"}`);
          console.error("Connection failed:", e);
        }

        app.stage.eventMode = "static";
        app.stage.hitArea = new PIXI.Rectangle(-10000, -10000, 20000, 20000);
        app.stage.on("pointermove", (e) => {
          if (!roomRef.current) return;
          const angle = Math.atan2(e.global.y - app.screen.height / 2, e.global.x - app.screen.width / 2);
          roomRef.current.send("move", { targetAngle: angle });
        });

        resizeHandler = () => app.renderer.resize(window.innerWidth, window.innerHeight);
        window.addEventListener("resize", resizeHandler);

      } catch (err) {
        console.error("PixiJS init error:", err);
        setStatus("error");
        setStatusMsg("❌ Render hatası");
      }
    };

    initApp();
    return () => {
      if (destroyed) return;
      destroyed = true;
      if (roomRef.current) { roomRef.current.leave(); roomRef.current = null; }
      if (resizeHandler) window.removeEventListener("resize", resizeHandler);
      if (app) {
        try { app.destroy({ children: true }); } catch (_) { /* PixiJS v8 Strict Mode safe */ }
      }
    };
  }, []);

  const statusColors: Record<Status, string> = {
    connecting: "#f59e0b",
    connected: "#00ff88",
    error: "#ff4444",
  };

  return (
    <div style={{ position: "relative", width: "100vw", height: "100vh" }}>
      <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "100%", outline: "none", cursor: "none" }} />

      {/* HUD Overlay */}
      <div style={{
        position: "absolute", top: 12, left: 12,
        background: "rgba(0,0,0,0.7)", border: `1px solid ${statusColors[status]}`,
        borderRadius: 8, padding: "8px 14px", color: statusColors[status],
        fontFamily: "monospace", fontSize: 13, backdropFilter: "blur(4px)",
        display: "flex", flexDirection: "column", gap: 4,
      }}>
        <div>🌐 {statusMsg}</div>
        {status === "connected" && <div>👥 Oyuncu: {playerCount}</div>}
      </div>
    </div>
  );
}
