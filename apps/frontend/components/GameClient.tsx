"use client";

import { useEffect, useRef } from "react";
import * as PIXI from "pixi.js";
import { Client, Room } from "colyseus.js";

export default function GameClient() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const roomRef = useRef<Room | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    let app: PIXI.Application;

    const initApp = async () => {
        app = new PIXI.Application();
        await app.init({
          canvas: canvasRef.current!,
          width: window.innerWidth,
          height: window.innerHeight,
          backgroundColor: 0x111111,
          resolution: window.devicePixelRatio || 1,
          autoDensity: true,
        });

        const client = new Client("ws://localhost:2567");
        const playerGraphics = new Map<string, PIXI.Graphics>();

        try {
          const room = await client.joinOrCreate("arena");
          roomRef.current = room;
          console.log("Joined successfully", room);

          room.state.players.onAdd((player: any, sessionId: string) => {
            const graphics = new PIXI.Graphics();
            
            // Draw a worm head
            graphics.circle(0, 0, 20);
            graphics.fill({ color: sessionId === room.sessionId ? 0x00ff00 : 0xff0000 });
            
            // Draw a line to indicate direction
            graphics.moveTo(0, 0);
            graphics.lineTo(20, 0);
            graphics.stroke({ width: 4, color: 0xffffff });
            
            graphics.x = player.x;
            graphics.y = player.y;
            
            app.stage.addChild(graphics);
            playerGraphics.set(sessionId, graphics);

            player.onChange(() => {
                const g = playerGraphics.get(sessionId);
                if(g) {
                    g.x = player.x;
                    g.y = player.y;
                    g.rotation = player.currentAngle;
                }
                
                if (sessionId === room.sessionId) {
                    app.stage.pivot.x = player.x;
                    app.stage.pivot.y = player.y;
                    app.stage.position.x = app.screen.width / 2;
                    app.stage.position.y = app.screen.height / 2;
                }
            });
          });

          room.state.players.onRemove((player: any, sessionId: string) => {
            const g = playerGraphics.get(sessionId);
            if (g) {
              app.stage.removeChild(g);
              g.destroy();
              playerGraphics.delete(sessionId);
            }
          });

        } catch (e) {
          console.error("Join error", e);
        }

        // Pointer Tracking for Movement
        app.stage.eventMode = 'static';
        app.stage.hitArea = new PIXI.Rectangle(-10000, -10000, 20000, 20000);

        app.stage.on("pointermove", (e) => {
            if (!roomRef.current) return;
            const room = roomRef.current;
            const currentPlayer = room.state.players.get(room.sessionId);
            if(!currentPlayer) return;

            const screenX = app.screen.width / 2;
            const screenY = app.screen.height / 2;
            
            const targetX = e.global.x;
            const targetY = e.global.y;

            const angle = Math.atan2(targetY - screenY, targetX - screenX);
            
            room.send("move", { targetAngle: angle });
        });
        
        const onResize = () => {
            app.renderer.resize(window.innerWidth, window.innerHeight);
        };
        window.addEventListener('resize', onResize);
    };

    initApp();

    return () => {
      if (roomRef.current) roomRef.current.leave();
      if (app) app.destroy(false, { children: true });
    };
  }, []);

  return <canvas ref={canvasRef} style={{ display: 'block', width: '100vw', height: '100vh', outline: 'none' }} />;
}
