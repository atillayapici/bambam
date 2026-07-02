import { Room, Client } from "@colyseus/core";
import { ArenaState, Player, Food, Segment } from "./schema/ArenaState";

export class ArenaRoom extends Room<ArenaState> {
  maxClients = 50;

  onCreate(options: any) {
    this.setState(new ArenaState());
    
    // Spawn initial foods
    this.spawnFood(100);

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

    this.state.players.forEach((player) => {
      // Boost Logic
      if (player.isBoosting && player.score > 10) {
        player.speed = 8;
        player.score -= 10 * (deltaTime / 1000); // drain 10 score per second
      } else {
        player.isBoosting = false;
        player.speed = 4;
      }

      // Smoothly rotate current angle towards target angle
      // (Simplified for now: snap to angle)
      player.currentAngle = player.targetAngle; 
      
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
          player.score += food.value;
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
}
