
export const CANVAS_WIDTH = 400;
export const CANVAS_HEIGHT = 600;

export const GRAVITY = 0.5;
export const JUMP_STRENGTH = -14; 
export const MOVE_SPEED = 5;
export const FRICTION = 0.8;

export const PLAYER_SIZE = 40;
export const PLATFORM_WIDTH = 105; 
export const PLATFORM_HEIGHT = 15;
export const PLATFORM_GAP_MIN = 60; 
export const PLATFORM_GAP_MAX = 110;

// Power-Up Configuration
export const POWERUP_SIZE = 20;
export const POWERUP_DURATION = 10000; // 10 seconds for timed abilities
export const POWERUP_SPAWN_CHANCE = 0.1; // 10% chance per platform

// Background Logo URL
export const BACKGROUND_LOGO_URL = '';

// Background Music URL
export const BACKGROUND_MUSIC_URL = 'https://commondatastorage.googleapis.com/codeskulptor-demos/pyman_assets/ateapill.ogg';

export const COLORS = {
  yellowBody: '#FCD34D', // tailwind amber-300
  yellowDark: '#D97706', // tailwind amber-600
  blueBody: '#5EEAD4',   // tailwind teal-300
  blueDark: '#0D9488',   // tailwind teal-600
  lightning: '#FFFFFF',
  text: '#1F2937',
  platform: '#94A3B8',   // tailwind slate-400
  bg: '#0F172A',         // tailwind slate-900
  
  // PowerUp Colors
  shield: '#60A5FA',     // Blue-400
  multiplier: '#FBBF24', // Amber-400
  giant: '#10B981',      // Emerald-500
  booster: '#EF4444'     // Red-500
};

// Define Difficulty/Color Tiers based on Score
export const SCORE_TIERS = [
  { min: 0, color: '#94A3B8', light: '#CBD5E1', multiplier: 1 },      // Slate (Default)
  { min: 1000, color: '#10B981', light: '#6EE7B7', multiplier: 1.5 }, // Emerald
  { min: 2500, color: '#3B82F6', light: '#93C5FD', multiplier: 2 },   // Blue
  { min: 5000, color: '#8B5CF6', light: '#C4B5FD', multiplier: 3 },   // Violet
  { min: 8000, color: '#F43F5E', light: '#FDA4AF', multiplier: 5 },   // Rose (Hardest)
];

// Character Specific Stats
export const CHARACTER_SPECS = {
  YELLOW: { // Sparky
    jumpStrength: -15.0, // Higher jump
    gravity: 0.5,        // Standard gravity
    moveSpeed: 1.2,      // Faster acceleration
    description: "⚡ 높은 점프 & 빠른 속도"
  },
  BLUE: { // Uni
    jumpStrength: -13.5, // Slightly lower jump
    gravity: 0.38,       // Low gravity (Floaty)
    moveSpeed: 0.9,      // Standard speed
    description: "💧 저중력 (천천히 떨어짐)"
  }
};
