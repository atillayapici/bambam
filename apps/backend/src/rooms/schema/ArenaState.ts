import { Schema, type, MapSchema, ArraySchema } from "@colyseus/schema";

export class Segment extends Schema {
  @type("number") x: number = 0;
  @type("number") y: number = 0;
}

export class Food extends Schema {
  @type("number") x: number = 0;
  @type("number") y: number = 0;
  @type("number") color: number = 0;
  @type("number") size: number = 5;
  @type("number") value: number = 10;
}

export class PowerUp extends Schema {
  @type("number") x: number = 0;
  @type("number") y: number = 0;
  @type("string") type: string = "";
}

export class Player extends Schema {
  @type("string") name: string = "";
  @type("number") color: number = 0x00ff88;
  @type("number") x: number = 0;
  @type("number") y: number = 0;
  @type("number") targetAngle: number = 0;
  @type("number") currentAngle: number = 0;
  @type("number") speed: number = 4;
  @type("boolean") isBoosting: boolean = false;
  @type("boolean") isBot: boolean = false;
  @type("number") score: number = 0;
  @type("string") activePowerup: string = "";
  @type([Segment]) segments = new ArraySchema<Segment>();
}

export class ArenaState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
  @type({ map: Food }) foods = new MapSchema<Food>();
  @type({ map: PowerUp }) powerups = new MapSchema<PowerUp>();
}
