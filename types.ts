
export enum GameState {
  START = 'START',
  PLAYING = 'PLAYING',
  GAME_OVER = 'GAME_OVER'
}

export enum CharacterType {
  YELLOW = 'YELLOW',
  BLUE = 'BLUE'
}

export enum PowerUpType {
  SHIELD = 'SHIELD',
  SCORE_MULTIPLIER = 'SCORE_MULTIPLIER',
  GIANT = 'GIANT',
  BOOSTER = 'BOOSTER'
}

export interface Player {
  x: number;
  y: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
  type: CharacterType;
  isJumping: boolean;

  // Character Stats
  baseJumpStrength: number;
  gravity: number;
  moveSpeed: number;

  // Power-up states
  shieldCount: number;
  scoreMultiplierActive: boolean;
  scoreMultiplierEndTime?: number;
  isGiant: boolean;
  giantEndTime?: number;
  isBoosting: boolean;
  boosterEndTime?: number;
}

export interface Platform {
  x: number;
  y: number;
  width: number;
  height: number;
  id: number;
  // Moving platform properties
  isMoving?: boolean;
  moveSpeed?: number;     // Current speed
  initialX?: number;      // Center point of movement
  moveRange?: number;     // How far it moves left/right
  // Power-up
  powerUp?: PowerUpType;
  // Visuals
  color?: string;
  lightColor?: string;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

export interface Ripple {
  x: number;
  y: number;
  life: number;
  maxRadius: number;
}

export interface LeaderboardEntry {
  name: string;
  score: number;
  character: CharacterType;
  timestamp: number;
}
