import { Room, Client } from "@colyseus/core";
import { ArenaState, Player, Food, Segment } from "./schema/ArenaState";

export class ArenaRoom extends Room<ArenaState> {
  maxClients = 50;

  onCreate(options: any) {
    this.setState(new ArenaState());
    
    // Spawn initial foods
    this.spawnFood(150);

    // Spawn initial powerups
    this.spawnPowerUps(15);

    // Spawn 15 AI bots
    this.spawnBots(15);

    // Game Loop (60 times per second)
    this.setSimulationInterval((deltaTime) => this.update(deltaTime));

    // Listen for move messages from the client
    this.onMessage("move", (client, message: { targetAngle: number }) => {
      const player = this.state.players.get(client.sessionId);
      if (player) {
        player.targetAngle = message.targetAngle;
      }
    });

    // Listen for boost messages from the client
    this.onMessage("boost", (client, message: { state: boolean }) => {
      const player = this.state.players.get(client.sessionId);
      if (player) {
        player.isBoosting = message.state;
      }
    });
  }

  onJoin(client: Client, options: any) {
    console.log(client.sessionId, "joined!");
    const player = new Player();
    player.name  = (options?.name  || "Player").substring(0, 16);
    player.color = (typeof options?.color === "number") ? options.color : 0x00ff88;
    // Spawn randomly in a 2000x2000 area
    player.x = Math.random() * 2000;
    player.y = Math.random() * 2000;
    
    // Start with 5 segments
    for (let i = 0; i < 5; i++) {
      const seg = new Segment();
      seg.x = player.x;
      seg.y = player.y;
      player.segments.push(seg);
    }
    
    this.state.players.set(client.sessionId, player);
    console.log("Player added. Current server players size:", this.state.players.size);
  }

  onLeave(client: Client, consented: boolean) {
    console.log(client.sessionId, "left!");
    this.state.players.delete(client.sessionId);
  }

  update(deltaTime: number) {
    // Math logic for movement based on angle and speed
    const dt = deltaTime / (1000 / 60);

    this.state.players.forEach((player, sessionId) => {
      // --- BOT AI LOGIC ---
      if (player.isBot) {
        if (Math.random() < 0.05) { // 5% chance per frame to change mind
          let nearestFood: Food | null = null;
          let minDist = Infinity;
          
          for (const [_, food] of this.state.foods.entries()) {
            const distSq = Math.pow(food.x - player.x, 2) + Math.pow(food.y - player.y, 2);
            if (distSq < minDist && distSq < 250000) { // ~500px radius
              minDist = distSq;
              nearestFood = food;
            }
          }

          if (nearestFood) {
            player.targetAngle = Math.atan2(nearestFood.y - player.y, nearestFood.x - player.x);
          } else {
            player.targetAngle += (Math.random() - 0.5) * 1.5;
          }
          
          // Randomly boost if big enough
          if (player.score > 50 && Math.random() < 0.1) {
            player.isBoosting = true;
          } else if (Math.random() < 0.2) {
            player.isBoosting = false;
          }
        }

        // Steer away from walls
        const margin = 100;
        if (player.x < margin) player.targetAngle = 0; // right
        else if (player.x > 1900) player.targetAngle = Math.PI; // left
        if (player.y < margin) player.targetAngle = Math.PI / 2; // down
        else if (player.y > 1900) player.targetAngle = -Math.PI / 2; // up
      }

      // Handle PowerUp Timer
      if (player.activePowerup) {
        const pt = ((player as any).powerupTimer || 0) - dt;
        (player as any).powerupTimer = pt;
        if (pt <= 0) {
          player.activePowerup = "";
        }
      }

      // Check PowerUp Collision
      for (const [pId, p] of this.state.powerups.entries()) {
        const dx = player.x - p.x;
        const dy = player.y - p.y;
        if (dx * dx + dy * dy < 1600) { // 40px radius
          player.activePowerup = p.type;
          (player as any).powerupTimer = 60 * 10; // ~10 seconds
          this.state.powerups.delete(pId);
          this.spawnPowerUps(1);
        }
      }

      // Magnet Effect
      if (player.activePowerup === "magnet") {
        for (const [_, food] of this.state.foods.entries()) {
          const dx = player.x - food.x;
          const dy = player.y - food.y;
          if (dx * dx + dy * dy < 62500) { // 250px radius
            food.x += dx * 0.1 * dt;
            food.y += dy * 0.1 * dt;
          }
        }
      }

      // Boost / Speed Logic
      if (player.activePowerup === "speed") {
        player.speed = 10;
      } else if (player.isBoosting && player.score > 10) {
        player.speed = 8;
        player.score -= 10 * (deltaTime / 1000); // drain 10 score per second
      } else {
        player.isBoosting = false;
        player.speed = 4;
      }

      // Smooth angle rotation towards target (lerp)
      const angleDiff = player.targetAngle - player.currentAngle;
      const wrapped   = ((angleDiff + Math.PI) % (2 * Math.PI)) - Math.PI;
      player.currentAngle += wrapped * Math.min(1, 0.12 * dt);
      
      const vx = Math.cos(player.currentAngle) * player.speed;
      const vy = Math.sin(player.currentAngle) * player.speed;

      player.x += vx * dt;
      player.y += vy * dt;
      
      // Simple bounds checking (Arena 2000x2000)
      player.x = Math.max(0, Math.min(2000, player.x));
      player.y = Math.max(0, Math.min(2000, player.y));

      // Segment follow logic
      let prevX = player.x;
      let prevY = player.y;
      for (let i = 0; i < player.segments.length; i++) {
        const seg = player.segments[i]!;
        const dx = prevX - seg.x;
        const dy = prevY - seg.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const targetDist = 15; // spacing between segments
        
        if (dist > targetDist) {
          const moveRatio = (dist - targetDist) / dist;
          seg.x += dx * moveRatio;
          seg.y += dy * moveRatio;
        }
        prevX = seg.x;
        prevY = seg.y;
      }

      // Check food collision
      const playerRadius = 20;
      for (const [foodId, food] of this.state.foods.entries()) {
        const dx = player.x - food.x;
        const dy = player.y - food.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < playerRadius + food.size) {
          // Eat food
          const multiplier = player.activePowerup === "x2" ? 2 : 1;
          player.score += food.value * multiplier;
          this.state.foods.delete(foodId);
          this.spawnFood(1); // Respawn immediately to keep food constant
        }
      }

      // Dynamic segment management (Grow/Shrink based on score)
      const desiredSegments = 5 + Math.floor(player.score / 20);
      if (player.segments.length < desiredSegments) {
        const newSeg = new Segment();
        const lastSeg = player.segments.length > 0 ? player.segments[player.segments.length - 1]! : player;
        newSeg.x = lastSeg.x;
        newSeg.y = lastSeg.y;
        player.segments.push(newSeg);
      } else if (player.segments.length > desiredSegments && player.segments.length > 5) {
        // Pop the tail due to score drain (e.g. from boosting)
        const droppedSeg = player.segments.pop();
        if (droppedSeg) {
          // Occasionally drop food where the tail was
          if (Math.random() > 0.5) {
            const f = new Food();
            f.x = droppedSeg.x;
            f.y = droppedSeg.y;
            f.color = Math.floor(Math.random() * 0xffffff);
            f.size = 5;
            f.value = 10;
            const id = "drop_" + Math.random().toString(36).substring(2, 9);
            this.state.foods.set(id, f);
          }
        }
      }

      // --- SNAKE-TO-SNAKE COLLISION (DEATH) ---
      let died = false;
      if (player.activePowerup !== "invincible") {
        for (const [otherId, otherPlayer] of this.state.players.entries()) {
          if (sessionId === otherId) continue;
          
          for (let i = 0; i < otherPlayer.segments.length; i++) {
            const seg = otherPlayer.segments[i]!;
            const dx = player.x - seg.x;
            const dy = player.y - seg.y;
            const distSq = dx * dx + dy * dy;
            
            if (distSq < 625) { // 25 radius collision
              died = true;
              break;
            }
          }
          if (died) break;
        }
      }

      if (died) {
        // Drop mass as food
        for (let i = 0; i < player.segments.length; i++) {
          const seg = player.segments[i]!;
          const f = new Food();
          f.x = seg.x + (Math.random() - 0.5) * 30;
          f.y = seg.y + (Math.random() - 0.5) * 30;
          f.color = Math.floor(Math.random() * 0xffffff);
          f.size = 6 + Math.random() * 4;
          f.value = 25; 
          const id = "dead_" + Math.random().toString(36).substring(2, 9);
          this.state.foods.set(id, f);
        }
        
        // Respawn
        player.x = Math.random() * 2000;
        player.y = Math.random() * 2000;
        player.score = player.isBot ? (20 + Math.random() * 100) : 0;
        player.segments.clear();
        player.isBoosting = false;
        
        const newDesiredSegments = 5 + Math.floor(player.score / 20);
        for (let j = 0; j < newDesiredSegments; j++) {
          const seg = new Segment();
          seg.x = player.x;
          seg.y = player.y;
          player.segments.push(seg);
        }
        
        return; // continue to next player
      }
    });
  }

  onDispose() {
    console.log("room", this.roomId, "disposing...");
  }

  spawnFood(count: number) {
    for (let i = 0; i < count; i++) {
      const f = new Food();
      f.x = Math.random() * 2000;
      f.y = Math.random() * 2000;
      f.color = Math.floor(Math.random() * 0xffffff);
      f.size = 4 + Math.random() * 4;
      f.value = Math.floor(f.size * 2);
      const id = Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
      this.state.foods.set(id, f);
    }
  }

  spawnPowerUps(count: number) {
    const types = ["magnet", "invincible", "x2", "speed"];
    for (let i = 0; i < count; i++) {
      const p = new PowerUp();
      p.x = Math.random() * 2000;
      p.y = Math.random() * 2000;
      p.type = types[Math.floor(Math.random() * types.length)]!;
      const id = "pwrup_" + Math.random().toString(36).substring(2, 9);
      this.state.powerups.set(id, p);
    }
  }

  spawnBots(count: number) {
    const botNames  = ["Shadow","Viper","Cobra","Mamba","Naga","Hydra","Python","Rex","Zeus","Ares","Titan","Blaze","Storm","Chaos","Apex"];
    const botColors = [0xff6b35, 0xf72585, 0x4cc9f0, 0xffd60a, 0x06d6a0,
                       0x8ecae6, 0xfb8500, 0xff595e, 0x7209b7, 0x00d4ff,
                       0x06d6a0, 0xffd60a, 0xf72585, 0x4cc9f0, 0xff6b35];
    for (let i = 0; i < count; i++) {
      const bot  = new Player();
      bot.name   = botNames [i % botNames.length]!;
      bot.color  = botColors[i % botColors.length]!;
      bot.x = Math.random() * 2000;
      bot.y = Math.random() * 2000;
      bot.score = 20 + Math.floor(Math.random() * 100);
      bot.targetAngle = Math.random() * Math.PI * 2;
      bot.currentAngle = bot.targetAngle;
      bot.isBot = true;

      // Add corresponding segments
      const desiredSegments = 5 + Math.floor(bot.score / 20);
      for (let j = 0; j < desiredSegments; j++) {
        const seg = new Segment();
        seg.x = bot.x;
        seg.y = bot.y;
        bot.segments.push(seg);
      }
      
      const botId = "bot_" + Math.random().toString(36).substring(2, 8);
      this.state.players.set(botId, bot);
    }
  }
}
