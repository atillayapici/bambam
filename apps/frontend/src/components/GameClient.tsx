"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import * as PIXI from "pixi.js";
import { Client, Room } from "colyseus.js";

const SERVER_URL =
  process.env.NEXT_PUBLIC_SERVER_URL ||
  (typeof window !== "undefined" && window.location.hostname !== "localhost"
    ? "wss://bambam--atillayapici.replit.app"
    : "ws://localhost:2567");

const PALETTE = [
  0x00ff88, 0x00d4ff, 0xff6b35, 0xf72585,
  0x7209b7, 0x4cc9f0, 0xffd60a, 0x06d6a0,
  0xff595e, 0x8ecae6, 0xfb8500, 0x023047,
];

function playerColor(sessionId: string): number {
  let h = 0;
  for (let i = 0; i < sessionId.length; i++) h = sessionId.charCodeAt(i) + ((h << 5) - h);
  return PALETTE[Math.abs(h) % PALETTE.length]!;
}

type Screen = "menu" | "playing" | "dead";

interface LeaderEntry { name: string; score: number; isMe: boolean; color: number; }
interface MinimapDot  { x: number; y: number; color: number; isMe: boolean; }

const ARENA = 2000;
const MINI  = 160;
const MINI_SCALE = MINI / ARENA;

// ─────────────────────────────────────────────────────────────────────────────
export default function GameClient() {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const roomRef    = useRef<Room | null>(null);
  const appRef     = useRef<PIXI.Application | null>(null);
  const nameRef    = useRef("Player");

  const [screen,      setScreen]      = useState<Screen>("menu");
  const [playerName,  setPlayerName]  = useState("Player");
  const [score,       setScore]       = useState(0);
  const [isBoosting,  setIsBoosting]  = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderEntry[]>([]);
  const [minimapDots, setMinimapDots] = useState<MinimapDot[]>([]);
  const [deathScore,  setDeathScore]  = useState(0);
  const [errMsg,      setErrMsg]      = useState("");

  useEffect(() => { nameRef.current = playerName; }, [playerName]);

  // ─── startGame ──────────────────────────────────────────────────────────────
  const startGame = useCallback(async () => {
    if (!canvasRef.current) return;

    // Destroy previous session
    if (appRef.current) {
      try { appRef.current.destroy({ removeView: true }); } catch (_) {}
      appRef.current = null;
    }
    if (roomRef.current) { roomRef.current.leave(); roomRef.current = null; }

    setScreen("playing");
    setScore(0);
    setIsBoosting(false);
    setErrMsg("");

    let destroyed = false;
    let resizeHandler: () => void;

    try {
      // ── PIXI ────────────────────────────────────────────────────
      const app = new PIXI.Application();
      appRef.current = app;
      await app.init({
        canvas: canvasRef.current!,
        width: window.innerWidth,
        height: window.innerHeight,
        backgroundColor: 0x070714,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
        antialias: true,
      });

      // World container (moved for camera follow)
      const world = new PIXI.Container();
      app.stage.addChild(world);

      // Sub-layers (z-order: grid → food → segments → heads)
      const foodLayer    = new PIXI.Container();
      const segmentLayer = new PIXI.Container();
      const headLayer    = new PIXI.Container();

      // Grid background
      const grid = new PIXI.Graphics();
      for (let x = 0; x <= ARENA; x += 80) { grid.moveTo(x, 0); grid.lineTo(x, ARENA); }
      for (let y = 0; y <= ARENA; y += 80) { grid.moveTo(0, y); grid.lineTo(ARENA, y); }
      grid.stroke({ width: 1, color: 0x151530, alpha: 0.8 });
      grid.rect(0, 0, ARENA, ARENA);
      grid.stroke({ width: 6, color: 0x7b2d8b });
      world.addChild(grid);
      world.addChild(foodLayer);
      world.addChild(segmentLayer);
      world.addChild(headLayer);

      // ── COLYSEUS ────────────────────────────────────────────────
      const client = new Client(SERVER_URL);

      const foodGfx = new Map<string, PIXI.Graphics>();
      const headGfx = new Map<string, PIXI.Container>();
      const segMaps = new Map<string, Map<any, PIXI.Graphics>>();
      // Minimap state (mutable ref to avoid re-renders every frame)
      const dotsRef: MinimapDot[] = [];
      const dotMap  = new Map<string, MinimapDot>();

      let mySessionId = "";
      let myX = 1000, myY = 1000;
      let lastScore = 0;
      let minimapTimer = 0;

      const room = await client.joinOrCreate("arena", { name: nameRef.current }) as any;
      roomRef.current = room;
      mySessionId = room.sessionId;

      // ── Leaderboard helper ─────────────────────────────────────
      const updateLeaderboard = () => {
        const arr: LeaderEntry[] = [];
        room.state.players.forEach((p: any, sid: string) => {
          arr.push({ name: p.name || "?", score: Math.floor(p.score), isMe: sid === mySessionId, color: playerColor(sid) });
        });
        arr.sort((a, b) => b.score - a.score);
        setLeaderboard(arr.slice(0, 10));
      };

      // ── Food ───────────────────────────────────────────────────
      room.state.foods.onAdd((food: any, fid: string) => {
        const g = new PIXI.Graphics();
        const r = food.size;
        g.circle(0, 0, r + 3); g.fill({ color: food.color, alpha: 0.2 });
        g.circle(0, 0, r);     g.fill({ color: food.color });
        g.circle(-r * .25, -r * .3, r * .3); g.fill({ color: 0xffffff, alpha: 0.45 });
        g.x = food.x; g.y = food.y;
        foodLayer.addChild(g);
        foodGfx.set(fid, g);
      });
      room.state.foods.onRemove((_: any, fid: string) => {
        const g = foodGfx.get(fid);
        if (g) { foodLayer.removeChild(g); g.destroy(); foodGfx.delete(fid); }
      });

      // ── Player helper ──────────────────────────────────────────
      const addPlayer = (player: any, sessionId: string) => {
        if (headGfx.has(sessionId)) return;
        const isMe   = sessionId === mySessionId;
        const color  = isMe ? 0x00ff88 : playerColor(sessionId);
        const bodyC  = isMe ? 0x00bb55 : Math.max(0, color - 0x333333);

        // --- Head container ---
        const con = new PIXI.Container();

        const aura = new PIXI.Graphics();
        aura.circle(0, 0, 30); aura.fill({ color, alpha: 0.12 });
        con.addChild(aura);

        const face = new PIXI.Graphics();
        face.circle(0, 0, 20); face.fill({ color });
        // Pupils
        face.circle(9, -7, 5);  face.fill({ color: 0xffffff });
        face.circle(10, -7, 3); face.fill({ color: 0x111111 });
        face.circle(9.5, -8, 1.2); face.fill({ color: 0xffffff, alpha: 0.7 });
        con.addChild(face);

        // Nametag
        const tag = new PIXI.Text({
          text: player.name || "?",
          style: {
            fontFamily: "monospace",
            fontSize: 11,
            fontWeight: "bold",
            fill: isMe ? 0x00ff88 : 0xffffff,
            stroke: { color: 0x000000, width: 3 },
          }
        });
        tag.anchor.set(0.5, 1);
        tag.y = -28;
        con.addChild(tag);

        con.x = player.x; con.y = player.y;
        headLayer.addChild(con);
        headGfx.set(sessionId, con);

        // Segment map
        const sm = new Map<any, PIXI.Graphics>();
        segMaps.set(sessionId, sm);

        player.segments.onAdd((seg: any, idx: number) => {
          const s = new PIXI.Graphics();
          s.circle(0, 0, 18);
          s.fill({ color: bodyC, alpha: Math.max(0.3, 1 - idx * 0.013) });
          s.x = seg.x; s.y = seg.y;
          segmentLayer.addChild(s);
          sm.set(seg, s);
          seg.onChange(() => {
            if (!s || s.destroyed) return;
            s.x = seg.x; s.y = seg.y;
          });
        });

        player.segments.onRemove((seg: any) => {
          const s = sm.get(seg);
          if (s) { segmentLayer.removeChild(s); s.destroy(); sm.delete(seg); }
        });

        // Minimap dot
        const dot: MinimapDot = { x: player.x, y: player.y, color, isMe };
        dotMap.set(sessionId, dot);
        dotsRef.push(dot);

        // Per-frame updates via onChange
        player.onChange(() => {
          const c = headGfx.get(sessionId);
          if (!c || c.destroyed) return;
          c.x = player.x; c.y = player.y;
          c.rotation = player.currentAngle;

          // Update dot
          const d = dotMap.get(sessionId);
          if (d) { d.x = player.x; d.y = player.y; }

          if (isMe) {
            myX = player.x; myY = player.y;
            const sc = Math.floor(player.score);
            if (sc !== lastScore) {
              lastScore = sc;
              setScore(sc);
              // Death detection: score reset to 0 means we died & respawned
              if (sc === 0 && lastScore > 20) {
                setDeathScore(lastScore);
                setScreen("dead");
              }
            }
            // Smooth camera
            world.x = app.screen.width  / 2 - player.x;
            world.y = app.screen.height / 2 - player.y;
          }
        });

        updateLeaderboard();
      };

      const removePlayer = (sessionId: string) => {
        const c = headGfx.get(sessionId);
        if (c) { headLayer.removeChild(c); c.destroy(); headGfx.delete(sessionId); }
        const sm = segMaps.get(sessionId);
        if (sm) { sm.forEach(s => { segmentLayer.removeChild(s); s.destroy(); }); segMaps.delete(sessionId); }
        const dot = dotMap.get(sessionId);
        if (dot) { dotsRef.splice(dotsRef.indexOf(dot), 1); dotMap.delete(sessionId); }
        updateLeaderboard();
      };

      room.state.players.onAdd((p: any, sid: string) => addPlayer(p, sid));
      room.state.players.onRemove((_: any, sid: string) => removePlayer(sid));

      // ── PIXI Ticker — minimap update every 200ms ──────────────
      app.ticker.add((ticker) => {
        minimapTimer += ticker.deltaMS;
        if (minimapTimer > 200) {
          minimapTimer = 0;
          setMinimapDots([...dotsRef]);
        }
      });

      // ── INPUT ──────────────────────────────────────────────────
      app.stage.eventMode = "static";
      app.stage.hitArea = new PIXI.Rectangle(-100000, -100000, 200000, 200000);

      app.stage.on("pointermove", (e) => {
        if (!roomRef.current) return;
        const angle = Math.atan2(
          e.global.y - app.screen.height / 2,
          e.global.x - app.screen.width  / 2
        );
        roomRef.current.send("move", { targetAngle: angle });
      });
      app.stage.on("pointerdown",    () => { roomRef.current?.send("boost", { state: true });  setIsBoosting(true);  });
      app.stage.on("pointerup",      () => { roomRef.current?.send("boost", { state: false }); setIsBoosting(false); });
      app.stage.on("pointerupoutside", () => { roomRef.current?.send("boost", { state: false }); setIsBoosting(false); });

      resizeHandler = () => app.renderer.resize(window.innerWidth, window.innerHeight);
      window.addEventListener("resize", resizeHandler);

    } catch (err: any) {
      console.error(err);
      setErrMsg("❌ " + (err?.message || "Bağlantı hatası"));
      setScreen("menu");
    }

    return () => {
      if (destroyed) return;
      destroyed = true;
      if (resizeHandler) window.removeEventListener("resize", resizeHandler);
      if (roomRef.current)  { roomRef.current.leave(); roomRef.current = null; }
      if (appRef.current)   { try { appRef.current.destroy({ removeView: true }); } catch (_) {}; appRef.current = null; }
    };
  }, []);

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ position: "relative", width: "100vw", height: "100vh", overflow: "hidden", background: "#070714" }}>

      {/* Canvas — always mounted so PIXI can attach */}
      <canvas
        ref={canvasRef}
        style={{
          display: screen === "playing" ? "block" : "none",
          width: "100%", height: "100%", outline: "none", cursor: "none",
        }}
      />

      {/* ── MAIN MENU ──────────────────────────────────────────────── */}
      {screen === "menu" && (
        <div style={{
          position: "absolute", inset: 0, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          background: "radial-gradient(ellipse at 50% 40%, #0d0d2b 0%, #070714 70%)",
        }}>
          {/* Decorative worm graphic */}
          <div style={{ fontSize: 64, marginBottom: 8, filter: "drop-shadow(0 0 20px #00ff88)" }}>🐛</div>

          <h1 style={{
            margin: 0, fontSize: 70, fontWeight: 900, letterSpacing: 5,
            fontFamily: "'Courier New', monospace",
            background: "linear-gradient(135deg, #00ff88 0%, #00d4ff 50%, #f72585 100%)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}>WORM ZONE</h1>

          <p style={{ color: "#555", fontSize: 14, letterSpacing: 8, fontFamily: "monospace", margin: "6px 0 48px" }}>
            MULTIPLAYER ARENA
          </p>

          {/* Name input */}
          <label style={{ color: "#00ff88", fontFamily: "monospace", fontSize: 11, letterSpacing: 3, marginBottom: 8 }}>
            İSMİNİ GİR
          </label>
          <input
            type="text" maxLength={16}
            value={playerName}
            onChange={e => setPlayerName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") startGame(); }}
            placeholder="Oyuncu adı…"
            style={{
              background: "rgba(255,255,255,0.04)", border: "1px solid #00ff88",
              borderRadius: 10, padding: "12px 24px", color: "#fff",
              fontSize: 18, fontFamily: "monospace", outline: "none",
              width: 280, textAlign: "center", marginBottom: 8,
              boxShadow: "0 0 20px rgba(0,255,136,0.2)",
            }}
          />

          {errMsg && <div style={{ color: "#ff4444", fontFamily: "monospace", fontSize: 13, marginBottom: 12 }}>{errMsg}</div>}

          <button
            onClick={startGame}
            style={{
              marginTop: 16,
              background: "linear-gradient(135deg, #00ff88, #00bb55)",
              border: "none", borderRadius: 14, padding: "16px 72px",
              color: "#070714", fontSize: 22, fontWeight: 900,
              fontFamily: "monospace", cursor: "pointer", letterSpacing: 2,
              boxShadow: "0 0 40px rgba(0,255,136,0.45), 0 4px 20px rgba(0,0,0,0.6)",
              transition: "transform 0.12s",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "scale(1.06)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = "scale(1)"; }}
          >
            OYNA ▶
          </button>

          <div style={{ marginTop: 48, color: "#333", fontSize: 12, fontFamily: "monospace", lineHeight: 2.2, textAlign: "center" }}>
            🖱 Fareyi hareket ettir → yön &nbsp;|&nbsp; Sol tıkla &amp; basılı tut → ⚡ Boost<br/>
            🍎 Yemleri ye → büyü &nbsp;|&nbsp; 🐍 Düşmanların gövdesine çarpma!
          </div>
        </div>
      )}

      {/* ── DEATH SCREEN ───────────────────────────────────────────── */}
      {screen === "dead" && (
        <div style={{
          position: "absolute", inset: 0, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          background: "rgba(7,7,20,0.93)", backdropFilter: "blur(10px)",
        }}>
          <div style={{ fontSize: 72, marginBottom: 12 }}>💀</div>
          <div style={{ fontSize: 52, fontWeight: 900, color: "#ff4444", fontFamily: "monospace", letterSpacing: 2 }}>ÖLDÜN!</div>
          <div style={{ color: "#777", fontFamily: "monospace", fontSize: 18, margin: "16px 0 40px" }}>
            Son skorun:&nbsp;
            <span style={{ color: "#ffd60a", fontWeight: 900, fontSize: 24 }}>{deathScore}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <button onClick={startGame} style={{
              background: "linear-gradient(135deg, #ff4444, #cc0000)",
              border: "none", borderRadius: 12, padding: "14px 64px",
              color: "#fff", fontSize: 20, fontWeight: 900,
              fontFamily: "monospace", cursor: "pointer",
              boxShadow: "0 0 30px rgba(255,68,68,0.5)",
            }}>TEKRAR OYNA</button>
            <button onClick={() => setScreen("menu")} style={{
              background: "transparent", border: "1px solid #333", borderRadius: 12,
              padding: "12px 40px", color: "#555", fontSize: 15,
              fontFamily: "monospace", cursor: "pointer",
            }}>Ana Menü</button>
          </div>
        </div>
      )}

      {/* ── HUD (in-game) ──────────────────────────────────────────── */}
      {screen === "playing" && (<>

        {/* Score pill — top center */}
        <div style={{
          position: "absolute", top: 18, left: "50%", transform: "translateX(-50%)",
          background: "rgba(0,0,0,0.65)", border: "1px solid rgba(0,255,136,0.35)",
          borderRadius: 40, padding: "8px 32px",
          color: "#00ff88", fontFamily: "monospace", fontSize: 24, fontWeight: 700,
          backdropFilter: "blur(6px)", boxShadow: "0 0 24px rgba(0,255,136,0.15)",
          pointerEvents: "none",
        }}>
          ⭐ {score}
        </div>

        {/* Boost pill */}
        {isBoosting && (
          <div style={{
            position: "absolute", top: 74, left: "50%", transform: "translateX(-50%)",
            color: "#ffd60a", fontFamily: "monospace", fontSize: 12, letterSpacing: 4,
            pointerEvents: "none",
            animation: "pulse .5s infinite alternate",
          }}>⚡ BOOST</div>
        )}

        {/* Leaderboard — top right */}
        <div style={{
          position: "absolute", top: 18, right: 18, minWidth: 190,
          background: "rgba(0,0,0,0.72)", border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 14, padding: "14px 18px", backdropFilter: "blur(8px)",
          pointerEvents: "none",
        }}>
          <div style={{ color: "#ffd60a", fontFamily: "monospace", fontSize: 11, fontWeight: 700, letterSpacing: 2, marginBottom: 10 }}>
            🏆 SKOR TABLOSU
          </div>
          {leaderboard.map((e, i) => (
            <div key={i} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10,
              fontFamily: "monospace", fontSize: 12, padding: "3px 0",
              color: e.isMe ? "#00ff88" : i === 0 ? "#ffd60a" : "#aaa",
              fontWeight: e.isMe ? 700 : 400,
              borderBottom: i < leaderboard.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
            }}>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{
                  width: 8, height: 8, borderRadius: "50%", display: "inline-block",
                  background: `#${e.color.toString(16).padStart(6, "0")}`,
                  flexShrink: 0,
                }} />
                {i + 1}. {e.name.substring(0, 10)}{e.isMe ? " ◀" : ""}
              </span>
              <span>{e.score}</span>
            </div>
          ))}
        </div>

        {/* Minimap — bottom right */}
        <div style={{
          position: "absolute", bottom: 18, right: 18,
          width: MINI, height: MINI,
          background: "rgba(0,0,0,0.72)", border: "1px solid rgba(123,45,139,0.5)",
          borderRadius: 10, overflow: "hidden", backdropFilter: "blur(4px)",
          pointerEvents: "none",
        }}>
          <svg width={MINI} height={MINI} style={{ display: "block" }}>
            {/* Arena border */}
            <rect x={1} y={1} width={MINI-2} height={MINI-2}
              fill="none" stroke="rgba(123,45,139,0.4)" strokeWidth={1} rx={8} />
            {/* Dots */}
            {minimapDots.map((d, i) => (
              <circle
                key={i}
                cx={d.x * MINI_SCALE}
                cy={d.y * MINI_SCALE}
                r={d.isMe ? 4 : 2.5}
                fill={`#${d.color.toString(16).padStart(6, "0")}`}
                opacity={d.isMe ? 1 : 0.8}
              />
            ))}
          </svg>
          <div style={{
            position: "absolute", top: 3, left: 0, right: 0,
            textAlign: "center", color: "rgba(255,255,255,0.25)",
            fontSize: 9, fontFamily: "monospace", letterSpacing: 2, pointerEvents: "none",
          }}>MAP</div>
        </div>

        {/* Controls hint — bottom left */}
        <div style={{
          position: "absolute", bottom: 20, left: 18,
          color: "rgba(255,255,255,0.18)", fontFamily: "monospace", fontSize: 11,
          lineHeight: 1.8, pointerEvents: "none",
        }}>
          🖱 Fare → Yön<br/>
          🖱 Tıkla → ⚡ Boost
        </div>

      </>)}

      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { overflow: hidden; }
        input { transition: box-shadow .2s; }
        input:focus { box-shadow: 0 0 30px rgba(0,255,136,0.35) !important; }
        @keyframes pulse { from { opacity:.55 } to { opacity:1 } }
      `}</style>
    </div>
  );
}
