"use client";

import { useEffect, useRef } from "react";
import * as PIXI from "pixi.js";
import { Client, Room } from "colyseus.js";

// Production: Replit backend URL (will update when Replit is running)
const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || "ws://localhost:2567";

export default function GameClient() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const roomRef = useRef<Room | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    let app: PIXI.Application;
    let resizeHandler: () => void;

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

        // Draw arena grid background
        const grid = new PIXI.Graphics();
        for (let x = 0; x <= 2000; x += 100) {
          grid.moveTo(x, 0);
          grid.lineTo(x, 2000);
        }
        for (let y = 0; y <= 2000; y += 100) {
          grid.moveTo(0, y);
          grid.lineTo(2000, y);
        }
        grid.stroke({ width: 1, color: 0x1a1a2e, alpha: 0.8 });

        // Arena border
        grid.rect(0, 0, 2000, 2000);
        grid.stroke({ width: 6, color: 0x7b2d8b, alpha: 1 });
        app.stage.addChild(grid);

        const client = new Client(SERVER_URL);
        const playerGraphics = new Map<string, PIXI.Graphics>();

        try {
          const room = await client.joinOrCreate("arena");
          roomRef.current = room;
          console.log("✅ Joined room successfully", room.sessionId);

          room.state.players.onAdd((player: any, sessionId: string) => {
            const g = new PIXI.Graphics();
            const isMe = sessionId === room.sessionId;

            // Worm head
            g.circle(0, 0, isMe ? 22 : 20);
            g.fill({ color: isMe ? 0x00ff88 : 0xff4444 });

            // Eye
            g.circle(10, -6, 5);
            g.fill({ color: 0xffffff });
            g.circle(12, -6, 3);
            g.fill({ color: 0x000000 });

            g.x = player.x;
            g.y = player.y;
            app.stage.addChild(g);
            playerGraphics.set(sessionId, g);

            player.onChange(() => {
              const graphic = playerGraphics.get(sessionId);
              if (graphic) {
                graphic.x = player.x;
                graphic.y = player.y;
                graphic.rotation = player.currentAngle;
              }

              if (sessionId === room.sessionId) {
                app.stage.pivot.x = player.x;
                app.stage.pivot.y = player.y;
                app.stage.position.x = app.screen.width / 2;
                app.stage.position.y = app.screen.height / 2;
              }
            });
          });

          room.state.players.onRemove((_player: any, sessionId: string) => {
            const g = playerGraphics.get(sessionId);
            if (g) {
              app.stage.removeChild(g);
              g.destroy();
              playerGraphics.delete(sessionId);
            }
          });
        } catch (e) {
          console.error("❌ Server connection failed:", e);
        }

        // Mouse tracking
        app.stage.eventMode = "static";
        app.stage.hitArea = new PIXI.Rectangle(-10000, -10000, 20000, 20000);
        app.stage.on("pointermove", (e) => {
          if (!roomRef.current) return;
          const room = roomRef.current;
          const angle = Math.atan2(
            e.global.y - app.screen.height / 2,
            e.global.x - app.screen.width / 2
          );
          room.send("move", { targetAngle: angle });
        });

        resizeHandler = () => {
          app.renderer.resize(window.innerWidth, window.innerHeight);
        };
        window.addEventListener("resize", resizeHandler);
      } catch (err) {
        console.error("❌ PixiJS init error:", err);
      }
    };

    initApp();

    return () => {
      if (roomRef.current) roomRef.current.leave();
      if (resizeHandler) window.removeEventListener("resize", resizeHandler);
      if (app) app.destroy(false, { children: true });
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ display: "block", width: "100vw", height: "100vh", outline: "none", cursor: "none" }}
    />
  );
}
