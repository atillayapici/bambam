"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import * as PIXI from "pixi.js";
import { Client, Room } from "colyseus.js";

const SERVER_URL =
  process.env.NEXT_PUBLIC_SERVER_URL ||
  (typeof window !== "undefined" && window.location.hostname !== "localhost"
    ? "wss://bambam--atillayapici.replit.app"
    : "ws://localhost:2567");

const ARENA = 2000;
const MINI  = 150;
const MINI_SCALE = MINI / ARENA;

const COLOR_OPTIONS = [
  { hex: "#00ff88", val: 0x00ff88 }, { hex: "#00d4ff", val: 0x00d4ff },
  { hex: "#f72585", val: 0xf72585 }, { hex: "#ffd60a", val: 0xffd60a },
  { hex: "#fb8500", val: 0xfb8500 }, { hex: "#7209b7", val: 0x7209b7 },
  { hex: "#06d6a0", val: 0x06d6a0 }, { hex: "#ff595e", val: 0xff595e },
];

// ── Web Audio helpers ───────────────────────────────────────────────────────
function createAudio() {
  if (typeof window === "undefined") return null;
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const play = (freq: number, freq2: number, dur: number, vol = 0.15) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.setValueAtTime(freq, ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(freq2, ctx.currentTime + dur);
      g.gain.setValueAtTime(vol, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      o.start(); o.stop(ctx.currentTime + dur);
    };
    return {
      eat:   () => play(500, 800, 0.08, 0.12),
      boost: () => play(200, 400, 0.15, 0.08),
      die:   () => { play(300, 80, 0.4, 0.2); play(200, 60, 0.5, 0.1); },
      resume: () => { if (ctx.state === "suspended") ctx.resume(); },
    };
  } catch { return null; }
}

type Screen = "menu" | "playing" | "dead";
interface LBEntry  { name: string; score: number; isMe: boolean; color: number; }
interface MiniDot  { x: number; y: number; color: number; isMe: boolean; }


export default function GameClient() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const roomRef   = useRef<Room | null>(null);
  const appRef    = useRef<PIXI.Application | null>(null);
  const audioRef  = useRef<ReturnType<typeof createAudio>>(null);
  const nameRef   = useRef("Player");
  const colorRef  = useRef(0x00ff88);

  const [screen,      setScreen]      = useState<Screen>("menu");
  const [playerName,  setPlayerName]  = useState("Player");
  const [selColor,    setSelColor]    = useState(0x00ff88);
  const [score,       setScore]       = useState(0);
  const [boosting,    setBoosting]    = useState(false);
  const [leaderboard, setLeaderboard] = useState<LBEntry[]>([]);
  const [miniDots,    setMiniDots]    = useState<MiniDot[]>([]);
  const [deathScore,  setDeathScore]  = useState(0);
  const [errMsg,      setErrMsg]      = useState("");

  useEffect(() => { nameRef.current  = playerName; }, [playerName]);
  useEffect(() => { colorRef.current = selColor;   }, [selColor]);

  const startGame = useCallback(async () => {
    if (!canvasRef.current) return;

    if (appRef.current)  { try { appRef.current.destroy({ removeView: true }); } catch(_){} appRef.current = null; }
    if (roomRef.current) { roomRef.current.leave(); roomRef.current = null; }

    const audio = audioRef.current ?? (audioRef.current = createAudio());

    setScreen("playing"); setScore(0); setBoosting(false); setErrMsg("");
    let destroyed = false, resizeHandler: () => void;

    try {
      const app = new PIXI.Application();
      appRef.current = app;
      await app.init({
        canvas: canvasRef.current!,
        width: window.innerWidth, height: window.innerHeight,
        backgroundColor: 0x070714,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true, antialias: true,
      });

      const world      = new PIXI.Container();
      const foodLayer  = new PIXI.Container();
      const segLayer   = new PIXI.Container();
      const headLayer  = new PIXI.Container();
      const fxLayer    = new PIXI.Container(); // particles

      const grid = new PIXI.Graphics();
      for (let x = 0; x <= ARENA; x += 80) { grid.moveTo(x,0); grid.lineTo(x,ARENA); }
      for (let y = 0; y <= ARENA; y += 80) { grid.moveTo(0,y); grid.lineTo(ARENA,y); }
      grid.stroke({ width: 1, color: 0x151530, alpha: 0.7 });
      grid.rect(0,0,ARENA,ARENA); grid.stroke({ width: 6, color: 0x7b2d8b });

      world.addChild(grid, foodLayer, segLayer, headLayer, fxLayer);
      app.stage.addChild(world);

      // ── COLYSEUS ──
      const client   = new Client(SERVER_URL);
      const foodGfx  = new Map<string, PIXI.Graphics>();
      const headGfx  = new Map<string, PIXI.Container>();
      const segMaps  = new Map<string, Map<any, PIXI.Graphics>>();
      const dotsArr: MiniDot[] = [];
      const dotMap   = new Map<string, MiniDot>();

      let myId = "", myScore = 0, prevScore = 0;
      let targetZoom = 1, currentZoom = 1;

      const room = await client.joinOrCreate("arena", {
        name: nameRef.current, color: colorRef.current,
      }) as any;
      roomRef.current = room; myId = room.sessionId;

      const updateLB = () => {
        const arr: LBEntry[] = [];
        room.state.players.forEach((p: any, sid: string) =>
          arr.push({ name: p.name||"?", score: Math.floor(p.score), isMe: sid===myId, color: p.color||0x00ff88 })
        );
        arr.sort((a,b)=>b.score-a.score);
        setLeaderboard(arr.slice(0,10));
      };

      // ── Food ──
      room.state.foods.onAdd((food: any, fid: string) => {
        const g = new PIXI.Graphics();
        const r = food.size;
        g.circle(0,0,r+3); g.fill({ color: food.color, alpha: 0.2 });
        g.circle(0,0,r);   g.fill({ color: food.color });
        g.circle(-r*.25,-r*.3,r*.3); g.fill({ color:0xffffff, alpha:0.4 });
        g.x=food.x; g.y=food.y;
        foodLayer.addChild(g); foodGfx.set(fid,g);
      });
      room.state.foods.onRemove((_:any, fid:string) => {
        const g = foodGfx.get(fid);
        if (g) { foodLayer.removeChild(g); g.destroy(); foodGfx.delete(fid); }
      });

      // ── Players ──
      const addPlayer = (player: any, sid: string) => {
        if (headGfx.has(sid)) return;
        const isMe  = sid === myId;
        const color = player.color ?? 0x00ff88;
        const bodyC = Math.max(0, color - 0x333333);

        const con  = new PIXI.Container();
        const aura = new PIXI.Graphics();
        aura.circle(0,0,30); aura.fill({ color, alpha: 0.12 });

        const face = new PIXI.Graphics();
        face.circle(0,0,20); face.fill({ color });
        face.circle(9,-7,5);  face.fill({ color:0xffffff });
        face.circle(10,-7,3); face.fill({ color:0x111111 });
        face.circle(9.5,-8,1.2); face.fill({ color:0xffffff, alpha:0.7 });

        const tag = new PIXI.Text({
          text: player.name||"?",
          style: { fontFamily:"monospace", fontSize:11, fontWeight:"bold",
                   fill: color, stroke:{ color:0x000000, width:3 } }
        });
        tag.anchor.set(0.5,1); tag.y=-28;

        con.addChild(aura, face, tag);
        con.x=player.x; con.y=player.y;
        headLayer.addChild(con);
        headGfx.set(sid,con);

        const sm = new Map<any, PIXI.Graphics>();
        segMaps.set(sid, sm);

        player.segments.onAdd((seg: any, idx: number) => {
          const s = new PIXI.Graphics();
          s.circle(0,0,18);
          s.fill({ color: bodyC, alpha: Math.max(0.3, 1-idx*0.013) });
          s.x=seg.x; s.y=seg.y;
          segLayer.addChild(s); sm.set(seg,s);
          seg.onChange(() => {
            if (!s||s.destroyed) return;
            s.x=seg.x; s.y=seg.y;
          });
        });
        player.segments.onRemove((seg: any) => {
          const s = sm.get(seg);
          if (s) { segLayer.removeChild(s); s.destroy(); sm.delete(seg); }
        });

        const dot: MiniDot = { x:player.x, y:player.y, color, isMe };
        dotMap.set(sid,dot); dotsArr.push(dot);

        player.onChange(() => {
          const c = headGfx.get(sid);
          if (!c||c.destroyed) return;
          c.x=player.x; c.y=player.y;
          c.rotation=player.currentAngle;

          const d = dotMap.get(sid);
          if (d) { d.x=player.x; d.y=player.y; }

          if (isMe) {
            const sc = Math.floor(player.score);
            if (sc !== myScore) {
              // Food eaten? trigger sound + detect death
              if (sc > myScore && myScore>=0) audio?.eat();
              if (sc === 0 && prevScore > 30) { audio?.die(); setDeathScore(prevScore); setScreen("dead"); }
              prevScore = myScore;
              myScore = sc;
              setScore(sc);
            }
            // Zoom: scale down as snake grows
            targetZoom = Math.max(0.45, 1 - sc * 0.00045);
          }
        });

        updateLB();
      };

      const removePlayer = (sid: string) => {
        const c = headGfx.get(sid); if (c) { headLayer.removeChild(c); c.destroy(); headGfx.delete(sid); }
        const sm = segMaps.get(sid); if (sm) { sm.forEach(s=>{segLayer.removeChild(s);s.destroy();}); segMaps.delete(sid); }
        const dot = dotMap.get(sid); if (dot) { dotsArr.splice(dotsArr.indexOf(dot),1); dotMap.delete(sid); }
        updateLB();
      };

      room.state.players.onAdd((p:any,sid:string) => addPlayer(p,sid));
      room.state.players.onRemove((_:any,sid:string) => removePlayer(sid));

      // ── Ticker: smooth zoom + minimap ──
      let miniTimer = 0;
      app.ticker.add((t) => {
        // Smooth zoom
        currentZoom += (targetZoom - currentZoom) * 0.05;
        world.scale.set(currentZoom);

        // Camera: recalculate with zoom
        const me = headGfx.get(myId);
        if (me) {
          world.x = app.screen.width  / 2 - me.x * currentZoom;
          world.y = app.screen.height / 2 - me.y * currentZoom;
        }

        // Minimap every 250ms
        miniTimer += t.deltaMS;
        if (miniTimer > 250) { miniTimer=0; setMiniDots([...dotsArr]); }
      });

      // ── Input ──
      app.stage.eventMode="static";
      app.stage.hitArea=new PIXI.Rectangle(-100000,-100000,200000,200000);
      app.stage.on("pointermove",(e)=>{
        if (!roomRef.current) return;
        audio?.resume();
        const angle=Math.atan2(e.global.y-app.screen.height/2, e.global.x-app.screen.width/2);
        roomRef.current.send("move",{targetAngle:angle});
      });
      app.stage.on("pointerdown",()=>{ audio?.resume(); audio?.boost(); roomRef.current?.send("boost",{state:true});  setBoosting(true);  });
      app.stage.on("pointerup",        ()=>{ roomRef.current?.send("boost",{state:false}); setBoosting(false); });
      app.stage.on("pointerupoutside", ()=>{ roomRef.current?.send("boost",{state:false}); setBoosting(false); });

      resizeHandler=()=>app.renderer.resize(window.innerWidth,window.innerHeight);
      window.addEventListener("resize",resizeHandler);

    } catch(err:any) {
      console.error(err);
      setErrMsg("❌ "+(err?.message||"Bağlantı hatası"));
      setScreen("menu");
    }

    return ()=>{
      if(destroyed) return; destroyed=true;
      if(resizeHandler) window.removeEventListener("resize",resizeHandler);
      if(roomRef.current){roomRef.current.leave();roomRef.current=null;}
      if(appRef.current){try{appRef.current.destroy({removeView:true});}catch(_){}appRef.current=null;}
    };
  },[]);

  return (
    <div style={{position:"relative",width:"100vw",height:"100vh",overflow:"hidden",background:"#070714"}}>
      <canvas ref={canvasRef}
        style={{display:screen==="playing"?"block":"none",width:"100%",height:"100%",outline:"none",cursor:"none"}}
      />

      {/* ── MAIN MENU ── */}
      {screen==="menu"&&(
        <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",
          alignItems:"center",justifyContent:"center",
          background:"radial-gradient(ellipse at 50% 40%,#0d0d2b 0%,#070714 70%)"}}>

          <div style={{fontSize:64,marginBottom:4,filter:"drop-shadow(0 0 24px #00ff88)"}}>🐛</div>
          <h1 style={{margin:0,fontSize:66,fontWeight:900,letterSpacing:5,fontFamily:"'Courier New',monospace",
            background:"linear-gradient(135deg,#00ff88 0%,#00d4ff 50%,#f72585 100%)",
            WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>WORM ZONE</h1>
          <p style={{color:"#444",fontSize:13,letterSpacing:7,fontFamily:"monospace",margin:"6px 0 40px"}}>
            MULTIPLAYER ARENA
          </p>

          <label style={{color:"#888",fontFamily:"monospace",fontSize:11,letterSpacing:3,marginBottom:8}}>İSMİNİ GİR</label>
          <input type="text" maxLength={16} value={playerName}
            onChange={e=>setPlayerName(e.target.value)}
            onKeyDown={e=>{if(e.key==="Enter")startGame();}}
            placeholder="Oyuncu adı…"
            style={{background:"rgba(255,255,255,0.04)",border:"1px solid #00ff88",borderRadius:10,
              padding:"12px 24px",color:"#fff",fontSize:18,fontFamily:"monospace",
              outline:"none",width:280,textAlign:"center",marginBottom:20,
              boxShadow:"0 0 20px rgba(0,255,136,0.2)"}}
          />

          {/* Color picker */}
          <label style={{color:"#888",fontFamily:"monospace",fontSize:11,letterSpacing:3,marginBottom:10}}>YILAN RENGİ</label>
          <div style={{display:"flex",gap:10,marginBottom:28}}>
            {COLOR_OPTIONS.map(opt=>(
              <div key={opt.hex} onClick={()=>setSelColor(opt.val)}
                style={{width:32,height:32,borderRadius:"50%",background:opt.hex,cursor:"pointer",
                  border:selColor===opt.val?"3px solid #fff":"3px solid transparent",
                  boxShadow:selColor===opt.val?`0 0 12px ${opt.hex}`:"none",
                  transition:"all .15s",transform:selColor===opt.val?"scale(1.2)":"scale(1)"}}
              />
            ))}
          </div>

          {errMsg&&<div style={{color:"#ff4444",fontFamily:"monospace",fontSize:13,marginBottom:12}}>{errMsg}</div>}

          <button onClick={startGame}
            style={{background:`linear-gradient(135deg,${COLOR_OPTIONS.find(c=>c.val===selColor)?.hex||"#00ff88"},${COLOR_OPTIONS.find(c=>c.val===selColor)?.hex||"#00ff88"}99)`,
              border:"none",borderRadius:14,padding:"16px 72px",
              color:"#070714",fontSize:22,fontWeight:900,fontFamily:"monospace",cursor:"pointer",letterSpacing:2,
              boxShadow:`0 0 40px ${COLOR_OPTIONS.find(c=>c.val===selColor)?.hex||"#00ff88"}55,0 4px 20px rgba(0,0,0,0.6)`,
              transition:"transform .12s"}}
            onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.transform="scale(1.06)";}}
            onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.transform="scale(1)";}}
          >OYNA ▶</button>

          <div style={{marginTop:44,color:"#333",fontSize:12,fontFamily:"monospace",lineHeight:2.2,textAlign:"center"}}>
            🖱 Fare → yön &nbsp;|&nbsp; Sol tıkla → ⚡ Boost &nbsp;|&nbsp; 🍎 Ye → büyü &nbsp;|&nbsp; 🐍 Gövdeye çarpma!
          </div>
        </div>
      )}

      {/* ── DEATH SCREEN ── */}
      {screen==="dead"&&(
        <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",
          alignItems:"center",justifyContent:"center",
          background:"rgba(7,7,20,0.93)",backdropFilter:"blur(10px)"}}>
          <div style={{fontSize:72,marginBottom:12}}>💀</div>
          <div style={{fontSize:52,fontWeight:900,color:"#ff4444",fontFamily:"monospace",letterSpacing:2}}>ÖLDÜN!</div>
          <div style={{color:"#666",fontFamily:"monospace",fontSize:18,margin:"16px 0 40px"}}>
            Son skorun:&nbsp;<span style={{color:"#ffd60a",fontWeight:900,fontSize:26}}>{deathScore}</span>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <button onClick={startGame}
              style={{background:"linear-gradient(135deg,#ff4444,#cc0000)",border:"none",borderRadius:12,
                padding:"14px 64px",color:"#fff",fontSize:20,fontWeight:900,fontFamily:"monospace",cursor:"pointer",
                boxShadow:"0 0 30px rgba(255,68,68,0.5)"}}>TEKRAR OYNA</button>
            <button onClick={()=>setScreen("menu")}
              style={{background:"transparent",border:"1px solid #333",borderRadius:12,
                padding:"12px 40px",color:"#555",fontSize:15,fontFamily:"monospace",cursor:"pointer"}}>Ana Menü</button>
          </div>
        </div>
      )}

      {/* ── HUD ── */}
      {screen==="playing"&&(<>
        {/* Score */}
        <div style={{position:"absolute",top:18,left:"50%",transform:"translateX(-50%)",
          background:"rgba(0,0,0,0.65)",border:"1px solid rgba(0,255,136,0.35)",
          borderRadius:40,padding:"8px 32px",color:"#00ff88",fontFamily:"monospace",
          fontSize:24,fontWeight:700,backdropFilter:"blur(6px)",
          boxShadow:"0 0 24px rgba(0,255,136,0.15)",pointerEvents:"none"}}>
          ⭐ {score}
        </div>

        {boosting&&(
          <div style={{position:"absolute",top:72,left:"50%",transform:"translateX(-50%)",
            color:"#ffd60a",fontFamily:"monospace",fontSize:12,letterSpacing:4,
            pointerEvents:"none",animation:"pulse .5s infinite alternate"}}>⚡ BOOST</div>
        )}

        {/* Leaderboard */}
        <div style={{position:"absolute",top:18,right:18,minWidth:190,
          background:"rgba(0,0,0,0.72)",border:"1px solid rgba(255,255,255,0.08)",
          borderRadius:14,padding:"14px 18px",backdropFilter:"blur(8px)",pointerEvents:"none"}}>
          <div style={{color:"#ffd60a",fontFamily:"monospace",fontSize:11,fontWeight:700,
            letterSpacing:2,marginBottom:10}}>🏆 SKOR TABLOSU</div>
          {leaderboard.map((e,i)=>(
            <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
              gap:10,fontFamily:"monospace",fontSize:12,padding:"3px 0",
              color:e.isMe?"#00ff88":i===0?"#ffd60a":"#aaa",
              fontWeight:e.isMe?700:400,
              borderBottom:i<leaderboard.length-1?"1px solid rgba(255,255,255,0.04)":"none"}}>
              <span style={{display:"flex",alignItems:"center",gap:6}}>
                <span style={{width:8,height:8,borderRadius:"50%",display:"inline-block",
                  background:`#${e.color.toString(16).padStart(6,"0")}`,flexShrink:0}}/>
                {i+1}. {e.name.substring(0,10)}{e.isMe?" ◀":""}
              </span>
              <span>{e.score}</span>
            </div>
          ))}
        </div>

        {/* Minimap */}
        <div style={{position:"absolute",bottom:18,right:18,width:MINI,height:MINI,
          background:"rgba(0,0,0,0.72)",border:"1px solid rgba(123,45,139,0.5)",
          borderRadius:10,overflow:"hidden",backdropFilter:"blur(4px)",pointerEvents:"none"}}>
          <svg width={MINI} height={MINI} style={{display:"block"}}>
            <rect x={1} y={1} width={MINI-2} height={MINI-2}
              fill="none" stroke="rgba(123,45,139,0.4)" strokeWidth={1} rx={8}/>
            {miniDots.map((d,i)=>(
              <circle key={i} cx={d.x*MINI_SCALE} cy={d.y*MINI_SCALE}
                r={d.isMe?4.5:2.5}
                fill={`#${d.color.toString(16).padStart(6,"0")}`}
                opacity={d.isMe?1:0.75}/>
            ))}
          </svg>
          <div style={{position:"absolute",top:3,left:0,right:0,textAlign:"center",
            color:"rgba(255,255,255,0.22)",fontSize:9,fontFamily:"monospace",letterSpacing:2}}>MAP</div>
        </div>

        {/* Hint */}
        <div style={{position:"absolute",bottom:20,left:18,color:"rgba(255,255,255,0.18)",
          fontFamily:"monospace",fontSize:11,lineHeight:1.8,pointerEvents:"none"}}>
          🖱 Fare → Yön<br/>🖱 Tıkla → ⚡ Boost
        </div>
      </>)}

      <style>{`
        *{box-sizing:border-box;margin:0;padding:0;}
        body{overflow:hidden;}
        input:focus{box-shadow:0 0 30px rgba(0,255,136,0.35)!important;}
        @keyframes pulse{from{opacity:.5}to{opacity:1}}
      `}</style>
    </div>
  );
}
