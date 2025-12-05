
import React, { useRef, useEffect, useCallback, useState } from 'react';
import { GameState, Player, Platform, CharacterType, Particle, PowerUpType, Ripple } from '../types';
import { 
  CANVAS_WIDTH, 
  CANVAS_HEIGHT, 
  GRAVITY, 
  JUMP_STRENGTH, 
  PLAYER_SIZE, 
  PLATFORM_WIDTH, 
  PLATFORM_HEIGHT, 
  COLORS,
  FRICTION,
  POWERUP_SIZE,
  POWERUP_SPAWN_CHANCE,
  POWERUP_DURATION,
  BACKGROUND_LOGO_URL,
  BACKGROUND_MUSIC_URL,
  SCORE_TIERS,
  CHARACTER_SPECS
} from '../constants';

interface GameCanvasProps {
  gameState: GameState;
  characterType: CharacterType;
  onScoreUpdate: (score: number) => void;
  onGameOver: () => void;
  resetTrigger: number;
  isMuted: boolean;
}

export const GameCanvas: React.FC<GameCanvasProps> = ({ 
  gameState, 
  characterType, 
  onScoreUpdate, 
  onGameOver,
  resetTrigger,
  isMuted
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  
  // BGM Audio Element Ref
  const bgmRef = useRef<HTMLAudioElement | null>(null);

  // Game Loop Timing Refs
  const lastTimeRef = useRef<number>(0);
  const accumulatorRef = useRef<number>(0);
  const readyEndTimeRef = useRef<number>(0); // Time when ready phase ends
  const lastReadyCountRef = useRef<number>(0); // To track countdown sound playback
  const FIXED_TIMESTEP = 1000 / 60; // Target exactly 60 physics updates per second
  const MAX_DELTA_TIME = 250; // Cap frame time to prevent spiraling on lag
  
  // Refs to hold latest callback functions
  const onScoreUpdateRef = useRef(onScoreUpdate);
  const onGameOverRef = useRef(onGameOver);

  useEffect(() => {
    onScoreUpdateRef.current = onScoreUpdate;
    onGameOverRef.current = onGameOver;
  }, [onScoreUpdate, onGameOver]);

  // Mutable game state
  const playerRef = useRef<Player>({
    x: CANVAS_WIDTH / 2 - PLAYER_SIZE / 2,
    y: CANVAS_HEIGHT - 150,
    vx: 0,
    vy: 0,
    width: PLAYER_SIZE,
    height: PLAYER_SIZE,
    type: characterType,
    isJumping: false,
    baseJumpStrength: -14,
    gravity: 0.5,
    moveSpeed: 1.0,
    shieldCount: 0,
    scoreMultiplierActive: false,
    scoreMultiplierEndTime: 0,
    isGiant: false,
    giantEndTime: 0,
    isBoosting: false,
    boosterEndTime: 0,
  });
  
  const platformsRef = useRef<Platform[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const ripplesRef = useRef<Ripple[]>([]);
  const scoreRef = useRef(0);
  const keysPressed = useRef<{ [key: string]: boolean }>({});
  const frameCountRef = useRef(0);
  
  // Power-up timers
  const multiplierTimerRef = useRef<number | null>(null);
  const giantTimerRef = useRef<number | null>(null);
  const boosterTimerRef = useRef<number | null>(null);

  // --- Sound Effects & Music ---
  const musicGainRef = useRef<GainNode | null>(null);

  // Initialize Audio Context for SFX
  const initAudio = () => {
    if (!audioCtxRef.current) {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContext) {
        audioCtxRef.current = new AudioContext();
        musicGainRef.current = audioCtxRef.current.createGain();
        musicGainRef.current.connect(audioCtxRef.current.destination);
        musicGainRef.current.gain.value = isMuted ? 0 : 0.05;
      }
    }
    if (audioCtxRef.current?.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    
    // Also try to start BGM if permitted
    if (gameState === GameState.PLAYING && bgmRef.current && bgmRef.current.paused && BACKGROUND_MUSIC_URL) {
        bgmRef.current.play().catch(e => console.log("BGM play prevented:", e));
    }
  };

  // Setup BGM Audio Element
  useEffect(() => {
    if (bgmRef.current) {
        bgmRef.current.pause();
        bgmRef.current = null;
    }

    if (BACKGROUND_MUSIC_URL) {
        bgmRef.current = new Audio(BACKGROUND_MUSIC_URL);
        bgmRef.current.loop = true;
        bgmRef.current.volume = 0.4; // Default volume
    }
    
    return () => {
        if (bgmRef.current) {
            bgmRef.current.pause();
            bgmRef.current = null;
        }
    };
  }, [BACKGROUND_MUSIC_URL]);

  // Handle Mute for BGM and SFX
  useEffect(() => {
    if (musicGainRef.current && audioCtxRef.current) {
        musicGainRef.current.gain.setValueAtTime(isMuted ? 0 : 0.05, audioCtxRef.current.currentTime);
    }
    if (bgmRef.current) {
        bgmRef.current.muted = isMuted;
    }
  }, [isMuted]);

  // Handle Play/Pause BGM based on GameState
  useEffect(() => {
    if (!bgmRef.current || !BACKGROUND_MUSIC_URL) return;

    if (gameState === GameState.PLAYING) {
        const playPromise = bgmRef.current.play();
        if (playPromise !== undefined) {
            playPromise.catch(error => {
                console.log("Auto-play prevented by browser policy");
            });
        }
    } else {
        bgmRef.current.pause();
        if (gameState === GameState.START) {
            bgmRef.current.currentTime = 0;
        }
    }
  }, [gameState]);

  const playSound = (type: 'jump' | 'die' | 'powerup' | 'shield' | 'collect_shield' | 'collect_star' | 'collect_mushroom' | 'collect_rocket' | 'beep' | 'start') => {
    if (!audioCtxRef.current || isMuted) return;
    try {
      const ctx = audioCtxRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      const t = ctx.currentTime;

      if (type === 'jump') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(300, t);
        osc.frequency.exponentialRampToValueAtTime(600, t + 0.1);
        gain.gain.setValueAtTime(0.1, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
        osc.start();
        osc.stop(t + 0.1);
      } else if (type === 'die') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(200, t);
        osc.frequency.exponentialRampToValueAtTime(50, t + 0.5);
        gain.gain.setValueAtTime(0.1, t);
        gain.gain.linearRampToValueAtTime(0, t + 0.5);
        osc.start();
        osc.stop(t + 0.5);
      } else if (type === 'powerup') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, t);
        osc.frequency.linearRampToValueAtTime(1200, t + 0.1);
        gain.gain.setValueAtTime(0.1, t);
        gain.gain.linearRampToValueAtTime(0, t + 0.2);
        osc.start();
        osc.stop(t + 0.2);
      } else if (type === 'shield') {
         osc.type = 'square';
         osc.frequency.setValueAtTime(100, t);
         osc.frequency.linearRampToValueAtTime(300, t + 0.2);
         gain.gain.setValueAtTime(0.05, t);
         gain.gain.linearRampToValueAtTime(0, t + 0.3);
         osc.start();
         osc.stop(t + 0.3);
      } else if (type === 'collect_shield') {
         osc.type = 'square';
         osc.frequency.setValueAtTime(300, t);
         osc.frequency.linearRampToValueAtTime(600, t + 0.15);
         gain.gain.setValueAtTime(0.1, t);
         gain.gain.linearRampToValueAtTime(0, t + 0.3);
         osc.start();
         osc.stop(t + 0.3);
      } else if (type === 'collect_star') {
         osc.type = 'triangle';
         osc.frequency.setValueAtTime(800, t);
         osc.frequency.setValueAtTime(1200, t + 0.05);
         gain.gain.setValueAtTime(0.1, t);
         gain.gain.linearRampToValueAtTime(0, t + 0.3);
         osc.start();
         osc.stop(t + 0.3);
      } else if (type === 'collect_mushroom') {
         osc.type = 'sawtooth';
         osc.frequency.setValueAtTime(150, t);
         osc.frequency.exponentialRampToValueAtTime(400, t + 0.4);
         gain.gain.setValueAtTime(0.08, t);
         gain.gain.linearRampToValueAtTime(0, t + 0.4);
         osc.start();
         osc.stop(t + 0.4);
      } else if (type === 'collect_rocket') {
         osc.type = 'sawtooth';
         osc.frequency.setValueAtTime(200, t);
         osc.frequency.exponentialRampToValueAtTime(800, t + 1.0);
         gain.gain.setValueAtTime(0.1, t);
         gain.gain.exponentialRampToValueAtTime(0.01, t + 1.5);
         osc.start();
         osc.stop(t + 1.5);
      } else if (type === 'beep') {
         osc.type = 'sine';
         osc.frequency.setValueAtTime(440, t);
         osc.frequency.linearRampToValueAtTime(0, t + 0.1);
         gain.gain.setValueAtTime(0.05, t);
         gain.gain.linearRampToValueAtTime(0, t + 0.1);
         osc.start();
         osc.stop(t + 0.1);
      } else if (type === 'start') {
         osc.type = 'square';
         osc.frequency.setValueAtTime(880, t);
         osc.frequency.linearRampToValueAtTime(440, t + 0.3);
         gain.gain.setValueAtTime(0.1, t);
         gain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
         osc.start();
         osc.stop(t + 0.3);
      }
    } catch (e) {}
  };

  // Helper to get current score tier
  const getCurrentTier = (currentScore: number) => {
    for (let i = SCORE_TIERS.length - 1; i >= 0; i--) {
        if (currentScore >= SCORE_TIERS[i].min) {
            return SCORE_TIERS[i];
        }
    }
    return SCORE_TIERS[0];
  };

  // --- Game Logic ---

  const resetGame = useCallback(() => {
    initAudio();

    if (multiplierTimerRef.current) clearTimeout(multiplierTimerRef.current);
    if (giantTimerRef.current) clearTimeout(giantTimerRef.current);
    if (boosterTimerRef.current) clearTimeout(boosterTimerRef.current);
    
    keysPressed.current = {}; 

    // Apply Character specific stats
    const stats = CHARACTER_SPECS[characterType];

    playerRef.current = {
      x: CANVAS_WIDTH / 2 - PLAYER_SIZE / 2,
      y: CANVAS_HEIGHT - 150,
      vx: 0,
      vy: 0,
      width: PLAYER_SIZE,
      height: PLAYER_SIZE,
      type: characterType,
      isJumping: false,
      // Apply stats
      baseJumpStrength: stats.jumpStrength,
      gravity: stats.gravity,
      moveSpeed: stats.moveSpeed,
      // Power-ups
      shieldCount: 0,
      scoreMultiplierActive: false,
      scoreMultiplierEndTime: 0,
      isGiant: false,
      giantEndTime: 0,
      isBoosting: false,
      boosterEndTime: 0,
    };

    const initialTier = SCORE_TIERS[0];
    // Initial platforms are static, so use default color
    platformsRef.current = [
      { x: CANVAS_WIDTH / 2 - PLATFORM_WIDTH / 2, y: CANVAS_HEIGHT - 50, width: PLATFORM_WIDTH, height: PLATFORM_HEIGHT, id: 0, color: initialTier.color, lightColor: initialTier.light },
      { x: CANVAS_WIDTH / 2 - PLATFORM_WIDTH / 2, y: CANVAS_HEIGHT - 170, width: PLATFORM_WIDTH, height: PLATFORM_HEIGHT, id: 1, color: initialTier.color, lightColor: initialTier.light },
      { x: CANVAS_WIDTH / 2 - PLATFORM_WIDTH / 2 - 60, y: CANVAS_HEIGHT - 290, width: PLATFORM_WIDTH, height: PLATFORM_HEIGHT, id: 2, color: initialTier.color, lightColor: initialTier.light },
      { x: CANVAS_WIDTH / 2 - PLATFORM_WIDTH / 2 + 60, y: CANVAS_HEIGHT - 410, width: PLATFORM_WIDTH, height: PLATFORM_HEIGHT, id: 3, color: initialTier.color, lightColor: initialTier.light },
      { x: CANVAS_WIDTH / 2 - PLATFORM_WIDTH / 2, y: CANVAS_HEIGHT - 530, width: PLATFORM_WIDTH, height: PLATFORM_HEIGHT, id: 4, color: initialTier.color, lightColor: initialTier.light },
    ];
    
    scoreRef.current = 0;
    particlesRef.current = [];
    ripplesRef.current = [];
    
    // Set Ready Time (1.5 seconds for READY -> GO)
    readyEndTimeRef.current = performance.now() + 1500;
    lastReadyCountRef.current = 1; 
    
    lastTimeRef.current = performance.now();
    accumulatorRef.current = 0;

    if (onScoreUpdateRef.current) onScoreUpdateRef.current(0);
  }, [characterType]);

  useEffect(() => {
    resetGame();
  }, [resetTrigger, resetGame]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { 
        keysPressed.current[e.code] = true; 
    };
    const handleKeyUp = (e: KeyboardEvent) => { keysPressed.current[e.code] = false; };
    
    const handleTouchStart = (e: TouchEvent) => {
      initAudio();
      const touchX = e.touches[0].clientX;
      const touchY = e.touches[0].clientY;
      const rect = canvasRef.current?.getBoundingClientRect();
      
      if (!rect) return;
      const canvasX = touchX - rect.left;
      if (canvasX < rect.width / 2) {
        keysPressed.current['ArrowLeft'] = true;
        keysPressed.current['ArrowRight'] = false;
      } else {
        keysPressed.current['ArrowRight'] = true;
        keysPressed.current['ArrowLeft'] = false;
      }
    };

    const handleTouchEnd = () => {
      keysPressed.current['ArrowLeft'] = false;
      keysPressed.current['ArrowRight'] = false;
    };
    
    const startAudioContext = () => {
        initAudio();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    const cvs = canvasRef.current;
    if(cvs) {
        cvs.addEventListener('touchstart', handleTouchStart);
        cvs.addEventListener('touchend', handleTouchEnd);
        cvs.addEventListener('mousedown', startAudioContext);
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      if(cvs) {
          cvs.removeEventListener('touchstart', handleTouchStart);
          cvs.removeEventListener('touchend', handleTouchEnd);
          cvs.removeEventListener('mousedown', startAudioContext);
      }
    };
  }, []);

  useEffect(() => {
    if (gameState !== GameState.PLAYING) {
        playerRef.current.type = characterType;
    }

    lastTimeRef.current = performance.now();
    accumulatorRef.current = 0;

    const animate = () => {
      const now = performance.now();
      
      if (lastTimeRef.current === 0) {
        lastTimeRef.current = now;
      }
      
      let deltaTime = now - lastTimeRef.current;
      lastTimeRef.current = now;

      if (deltaTime > MAX_DELTA_TIME) {
          deltaTime = MAX_DELTA_TIME;
      }

      if (gameState === GameState.PLAYING) {
        const readyTimeRemaining = readyEndTimeRef.current - now;
        
        // Check if we are in the ready phase
        if (readyTimeRemaining > 0) {
            // Wait for Ready
        } else {
             // GO Sound Logic
             if (lastReadyCountRef.current > 0) {
                 playSound('start');
                 lastReadyCountRef.current = 0;
             }

            accumulatorRef.current += deltaTime;

            let steps = 0;
            while (accumulatorRef.current >= FIXED_TIMESTEP) {
              updatePhysics();
              frameCountRef.current++; 
              accumulatorRef.current -= FIXED_TIMESTEP;
              
              steps++;
              if (steps > 240) { 
                 accumulatorRef.current = 0;
                 break;
              }
            }
        }
      }
      
      draw();
      requestRef.current = requestAnimationFrame(animate);
    };

    requestRef.current = requestAnimationFrame(animate);

    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [gameState, characterType]);

  const createParticles = (x: number, y: number, color: string) => {
    for (let i = 0; i < 6; i++) {
      particlesRef.current.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 6,
        vy: (Math.random() - 0.5) * 6,
        life: 1.0,
        color
      });
    }
  };

  const createRipple = (x: number, y: number) => {
    ripplesRef.current.push({
      x,
      y,
      life: 1.0,
      maxRadius: 30
    });
  };

  const createPowerUpVisuals = (x: number, y: number, type: PowerUpType) => {
    switch (type) {
      case PowerUpType.SHIELD:
        // Radial burst
        for (let i = 0; i < 24; i++) {
          const angle = (Math.PI * 2 * i) / 24;
          const speed = 3 + Math.random() * 2;
          particlesRef.current.push({
            x,
            y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 0.8,
            color: COLORS.shield
          });
        }
        break;
      case PowerUpType.SCORE_MULTIPLIER:
        // Fountain of gold
        for (let i = 0; i < 20; i++) {
           particlesRef.current.push({
            x,
            y,
            vx: (Math.random() - 0.5) * 6,
            vy: -Math.random() * 10,
            life: 1.0,
            color: COLORS.multiplier
          });
        }
        break;
      case PowerUpType.GIANT:
        // Explosive growth particles
        for (let i = 0; i < 30; i++) {
           particlesRef.current.push({
            x,
            y,
            vx: (Math.random() - 0.5) * 15,
            vy: (Math.random() - 0.5) * 15,
            life: 1.0,
            color: COLORS.giant
          });
        }
        break;
      case PowerUpType.BOOSTER:
        // Downward thrust explosion
        for (let i = 0; i < 30; i++) {
           particlesRef.current.push({
            x,
            y: y + 20, 
            vx: (Math.random() - 0.5) * 12,
            vy: Math.random() * 12,
            life: 0.8,
            color: Math.random() > 0.5 ? COLORS.booster : '#FBBF24'
          });
        }
        break;
    }
  };

  const activatePowerUp = (type: PowerUpType) => {
      const p = playerRef.current;
      const now = performance.now();
      
      createPowerUpVisuals(p.x + p.width / 2, p.y + p.height / 2, type);

      if (type === PowerUpType.SHIELD) {
          playSound('collect_shield');
          p.shieldCount = 1
      } else if (type === PowerUpType.SCORE_MULTIPLIER) {
          playSound('collect_star');
          let duration = POWERUP_DURATION;
          if (p.scoreMultiplierActive && p.scoreMultiplierEndTime && p.scoreMultiplierEndTime > now) {
              duration += (p.scoreMultiplierEndTime - now);
          }
          p.scoreMultiplierActive = true;
          p.scoreMultiplierEndTime = now + duration;
          
          if (multiplierTimerRef.current) clearTimeout(multiplierTimerRef.current);
          multiplierTimerRef.current = window.setTimeout(() => {
              playerRef.current.scoreMultiplierActive = false;
          }, duration);
      } else if (type === PowerUpType.GIANT) {
          playSound('collect_mushroom');
          let duration = 5000; // 5초
          if (p.isGiant && p.giantEndTime && p.giantEndTime > now) {
              duration += (p.giantEndTime - now);
          }
          if (!p.isGiant) {
              const oldW = p.width;
              const oldH = p.height;
              p.width = PLAYER_SIZE * 2.0; 
              p.height = PLAYER_SIZE * 2.0;
              p.y -= (p.height - oldH); 
              p.x -= (p.width - oldW) / 2;
          }
          p.isGiant = true;
          p.giantEndTime = now + duration;

          if (giantTimerRef.current) clearTimeout(giantTimerRef.current);
          giantTimerRef.current = window.setTimeout(() => {
             const curr = playerRef.current;
             curr.isGiant = false;
             const shrinkAmount = curr.height - PLAYER_SIZE;
             curr.y += shrinkAmount; 
             curr.x += (curr.width - PLAYER_SIZE) / 2;
             curr.width = PLAYER_SIZE;
             curr.height = PLAYER_SIZE;
          }, duration);
      } else if (type === PowerUpType.BOOSTER) {
          playSound('collect_rocket');
          let duration = 3000;
          if (p.isBoosting && p.boosterEndTime && p.boosterEndTime > now) {
              duration += (p.boosterEndTime - now);
          }
          p.isBoosting = true;
          p.boosterEndTime = now + duration;
          
          if (boosterTimerRef.current) clearTimeout(boosterTimerRef.current);
          boosterTimerRef.current = window.setTimeout(() => {
             playerRef.current.isBoosting = false;
          }, duration); 
      }
  };

  const updatePhysics = () => {
    const player = playerRef.current;
    const platforms = platformsRef.current;
    const currentScore = scoreRef.current;

    // Moving Platforms
    platforms.forEach(p => {
      if (p.isMoving && p.moveSpeed && p.initialX !== undefined && p.moveRange !== undefined) {
        p.x += p.moveSpeed;
        if (p.x > p.initialX + p.moveRange || p.x < p.initialX - p.moveRange) p.moveSpeed = -p.moveSpeed;
        if (p.x < 0) { p.x = 0; p.moveSpeed = Math.abs(p.moveSpeed); }
        if (p.x + p.width > CANVAS_WIDTH) { p.x = CANVAS_WIDTH - p.width; p.moveSpeed = -Math.abs(p.moveSpeed); }
      }
    });

    // Player Movement - use Character Stats
    if (keysPressed.current['ArrowLeft'] || keysPressed.current['KeyA']) player.vx -= player.moveSpeed;
    if (keysPressed.current['ArrowRight'] || keysPressed.current['KeyD']) player.vx += player.moveSpeed;

    player.vx *= FRICTION;
    player.x += player.vx;
    
    if (player.x < 0) {
        player.x = 0;
        player.vx = 0;
    }
    if (player.x + player.width > CANVAS_WIDTH) {
        player.x = CANVAS_WIDTH - player.width;
        player.vx = 0;
    }

    // Physics Update
    if (player.isBoosting) {
        player.vy = -12; 
        // Booster particles
        if (Math.random() > 0.5) {
            particlesRef.current.push({
                x: player.x + player.width / 2 + (Math.random() - 0.5) * 10,
                y: player.y + player.height,
                vx: (Math.random() - 0.5) * 2,
                vy: Math.random() * 5 + 2,
                life: 0.5,
                color: '#EF4444' 
            });
            particlesRef.current.push({
                x: player.x + player.width / 2 + (Math.random() - 0.5) * 6,
                y: player.y + player.height,
                vx: (Math.random() - 0.5) * 1,
                vy: Math.random() * 5 + 2,
                life: 0.3,
                color: '#FBBF24' 
            });
        }
    } else {
        player.vy += player.gravity;
    }
    
    player.y += player.vy;

    // Platform Interactions
    platforms.forEach(plat => {
      // 1. Landing collision (Only when not boosting and falling)
      if (player.vy > 0 && !player.isBoosting) {
        const playerLeft = player.x + 5;
        const playerRight = player.x + player.width - 5;
        const platLeft = plat.x;
        const platRight = plat.x + plat.width;

        if (
          playerRight > platLeft && 
          playerLeft < platRight &&
          player.y + player.height >= plat.y &&
          player.y + player.height <= plat.y + 20 
        ) {
          // Standard bounce
          player.vy = player.baseJumpStrength; 
          player.y = plat.y - player.height;
          player.vx *= 0.5; 
          
          playSound('jump');
          
          const centerX = player.x + player.width / 2;
          const bottomY = player.y + player.height;
          createRipple(centerX, bottomY);
          
          for(let i=0; i<4; i++) {
              particlesRef.current.push({
                  x: centerX + (Math.random() - 0.5) * player.width,
                  y: bottomY,
                  vx: (Math.random() - 0.5) * 4,
                  vy: -Math.random() * 2,
                  life: 0.8,
                  color: '#CBD5E1'
              });
          }
        }
      }

      // 2. PowerUp Collection (Separate check, always active, wider radius while boosting)
      if (plat.powerUp) {
          const puX = plat.x + plat.width / 2;
          const puY = plat.y - POWERUP_SIZE;
          const dist = Math.hypot((player.x + player.width/2) - puX, (player.y + player.height/2) - puY);
          
          // Increased radius for easier collection while boosting
          const collectionRadius = player.width * (player.isBoosting ? 1.5 : 1.0);

          if (dist < collectionRadius) { 
              activatePowerUp(plat.powerUp);
              plat.powerUp = undefined; 
              createParticles(puX, puY, COLORS.yellowBody);
          }
      }
    });

    // Scrolling
    if (player.y < CANVAS_HEIGHT / 2) {
      const diff = CANVAS_HEIGHT / 2 - player.y;
      player.y = CANVAS_HEIGHT / 2;
      platforms.forEach(p => p.y += diff);
      ripplesRef.current.forEach(r => r.y += diff);
      particlesRef.current.forEach(p => p.y += diff);
      
      const multiplier = player.scoreMultiplierActive ? 2 : 1;
      
      // Calculate Score Gain based on Tier
      const tier = getCurrentTier(scoreRef.current);
      const gainedScore = Math.floor(diff * multiplier * tier.multiplier);
      scoreRef.current += gainedScore;
      
      if (onScoreUpdateRef.current) onScoreUpdateRef.current(scoreRef.current);

      platformsRef.current = platforms.filter(p => p.y < CANVAS_HEIGHT);
      
      const lastPlat = platformsRef.current[platformsRef.current.length - 1];
      if (lastPlat && lastPlat.y > 70) { 
        // Generation Logic
        const gapY = Math.random() * 50 + 60;
        const y = lastPlat.y - gapY;
        
        let newWidth = PLATFORM_WIDTH;

       // ⭐ 난이도 랜덤 스케일 (0.8 ~ 1.2)
       const randomDifficulty = 0.8 + Math.random() * 0.4;

       // ⭐ 발판 폭에 적용
       newWidth = newWidth * randomDifficulty;

        
        if (currentScore > 500) {
           const shrinkFactor = Math.min((currentScore - 500) / 5000, 0.5);
           newWidth = Math.max(PLATFORM_WIDTH * (1 - shrinkFactor), 45);
        }

        const minX = Math.max(0, lastPlat.x - 200);
        const maxX = Math.min(CANVAS_WIDTH - newWidth, lastPlat.x + 200);
        let x = Math.max(0, Math.min(Math.random() * (maxX - minX) + minX, CANVAS_WIDTH - newWidth));

        // Moving Platform Chance
        let isMoving = false;
        let moveSpeed = 0;
        let moveRange = 0;
        let initialX = x;

        if (currentScore > 1500) {
             const chance = currentScore > 3000 ? 0.6 : 0.3;
             if (Math.random() < chance) {
                 isMoving = true;
                 const baseSpeed = currentScore > 3000 ? 2.5 : 1.5;
                 moveSpeed = (Math.random() > 0.5 ? 1 : -1) * baseSpeed;
                 moveRange = Math.random() * 50 + 50;
                 if (initialX - moveRange < 0) initialX = moveRange;
                 if (initialX + moveRange + newWidth > CANVAS_WIDTH) initialX = CANVAS_WIDTH - newWidth - moveRange;
                 x = initialX;
             }
        }      
        // ⭐ 이동형 발판 크기 랜덤 조정
if (isMoving) {
    const sizeRandom = 0.7 + Math.random() * 0.6;  // 0.7 ~ 1.3배
    newWidth = newWidth * sizeRandom;

    // 너무 작거나 큰 발판 방지
    newWidth = Math.max(40, Math.min(newWidth, PLATFORM_WIDTH * 1.5));
}

          // ⭐ 이동형일 때만 폭 랜덤 적용
if (isMoving) {
    const sizeRandom = 0.7 + Math.random() * 0.6; // 0.7 ~ 1.3배
    newWidth = newWidth * sizeRandom;

    // 안전 제한
    newWidth = Math.max(40, Math.min(newWidth, PLATFORM_WIDTH * 1.5));
}
        // PowerUp Spawn - Redistributed probabilities (0.25 each)
        let powerUp: PowerUpType | undefined;
        if (Math.random() < POWERUP_SPAWN_CHANCE) {
            const rand = Math.random();
            if (rand < 0.25) powerUp = PowerUpType.SHIELD;
            else if (rand < 0.50) powerUp = PowerUpType.SCORE_MULTIPLIER;
            else if (rand < 0.75) powerUp = PowerUpType.GIANT;
            else powerUp = PowerUpType.BOOSTER;
        }

        // Determine Color based on current Score
        const newTier = getCurrentTier(scoreRef.current);
        
        // 🎨 이동형 발판만 랜덤 색상 적용
let platformColor, platformLightColor;

if (isMoving) {
    // 이동형 발판은 랜덤 색상
    const randomTier = SCORE_TIERS[Math.floor(Math.random() * SCORE_TIERS.length)];
    platformColor = randomTier.color;
    platformLightColor = randomTier.light;
} else {
    // 일반 발판은 기존처럼 기본 티어 색상 유지
    const baseTier = SCORE_TIERS[0];
    platformColor = baseTier.color;
    platformLightColor = baseTier.light;
}


        platformsRef.current.push({ 
            x, y, width: newWidth, height: PLATFORM_HEIGHT, id: Math.random(),
            isMoving, moveSpeed, moveRange, initialX, powerUp,
            color: platformColor, lightColor: platformLightColor
        });
      }
    }

    if (player.y > CANVAS_HEIGHT) {
       if (player.shieldCount > 0) {
           player.shieldCount--; 
           player.vy = player.baseJumpStrength * 1.5; // Super jump on shield usage
           playSound('shield');
           createParticles(player.x + player.width/2, player.y, COLORS.shield);
       } else {
           playSound('die');
           if (onGameOverRef.current) onGameOverRef.current();
       }
    }

    particlesRef.current.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 0.05;
    });
    particlesRef.current = particlesRef.current.filter(p => p.life > 0);

    ripplesRef.current.forEach(r => {
        r.life -= 0.05;
    });
    ripplesRef.current = ripplesRef.current.filter(r => r.life > 0);
  };

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Platforms
    platformsRef.current.forEach(p => {
      // Use platform's assigned color
      ctx.fillStyle = p.color || COLORS.platform;
      ctx.beginPath();
      ctx.roundRect(p.x, p.y, p.width, p.height, 5);
      ctx.fill();
      
      ctx.fillStyle = p.lightColor || '#CBD5E1';
      ctx.beginPath();
      ctx.roundRect(p.x + 2, p.y + 2, p.width - 4, p.height / 2, 3);
      ctx.fill();

      if (p.isMoving) {
          ctx.fillStyle = '#334155';
          ctx.beginPath();
          ctx.arc(p.x + 5, p.y + p.height/2, 2, 0, Math.PI*2);
          ctx.arc(p.x + p.width - 5, p.y + p.height/2, 2, 0, Math.PI*2);
          ctx.fill();
      }

      // Draw PowerUp Item
      if (p.powerUp) {
          const px = p.x + p.width / 2;
          const py = p.y - 15;
          ctx.textAlign = 'center';
          ctx.font = '20px Fredoka';
          let icon = '';
          if (p.powerUp === PowerUpType.SHIELD) icon = '🛡️';
          else if (p.powerUp === PowerUpType.SCORE_MULTIPLIER) icon = '⭐';
          else if (p.powerUp === PowerUpType.GIANT) icon = '🍄';
          else if (p.powerUp === PowerUpType.BOOSTER) icon = '🚀';

          if (icon) {
            ctx.fillText(icon, px, py + Math.sin(frameCountRef.current * 0.1) * 5);
          }
      }
    });

    // Ripples
    ripplesRef.current.forEach(r => {
        ctx.strokeStyle = `rgba(255, 255, 255, ${r.life * 0.5})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        const radius = r.maxRadius * (1 - r.life);
        ctx.ellipse(r.x, r.y, radius, radius * 0.4, 0, 0, Math.PI * 2);
        ctx.stroke();
    });

    // Particles
    particlesRef.current.forEach(p => {
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.life;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    });

    drawCharacter(ctx, playerRef.current);

    // Ready Countdown Text
    const now = performance.now();
    const readyTimeRemaining = readyEndTimeRef.current - now;
    
    if (gameState === GameState.PLAYING && readyTimeRemaining > -1000) {
        ctx.save();
        ctx.translate(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
        
        let text = "";
        let scale = 1;
        let alpha = 1;

        if (readyTimeRemaining > 0) {
            text = "READY";
            // Pulse animation
            scale = 1 + Math.sin(now * 0.005) * 0.1; 
        } else {
            text = "GO!";
            const elapsed = Math.abs(readyTimeRemaining);
            scale = 1 + (elapsed / 1000);
            alpha = 1 - (elapsed / 1000); // Fade out
        }

        if (alpha > 0) {
            ctx.scale(scale, scale);
            ctx.globalAlpha = alpha;
            
            ctx.font = "900 60px Fredoka, sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            
            // Stroke
            ctx.lineWidth = 8;
            ctx.strokeStyle = "rgba(0,0,0,0.5)";
            ctx.strokeText(text, 0, 0);
            
            // Fill
            ctx.fillStyle = text === "GO!" ? "#FCD34D" : "#FFFFFF"; 
            ctx.fillText(text, 0, 0);
        }
        
        ctx.restore();
    }
  };
  
  const drawCharacter = (ctx: CanvasRenderingContext2D, p: Player) => {
    const bodyColor = p.type === CharacterType.YELLOW ? COLORS.yellowBody : COLORS.blueBody;
    const now = performance.now();
    
    ctx.save();
    ctx.translate(p.x, p.y);

    // Blinking Warning Logic (Booster & Giant - Body Blink)
    let bodyAlpha = 1.0;
    
    // Check Booster Warning (last 3s)
    if (p.isBoosting && p.boosterEndTime) {
        const timeLeft = p.boosterEndTime - now;
        if (timeLeft < 3000 && timeLeft > 0) {
            if (Math.floor(timeLeft / 100) % 2 === 0) bodyAlpha = 0.5;
        }
    }
    
    // Check Giant Warning (last 3s)
    if (p.isGiant && p.giantEndTime) {
        const timeLeft = p.giantEndTime - now;
        if (timeLeft < 3000 && timeLeft > 0) {
            if (Math.floor(timeLeft / 100) % 2 === 0) bodyAlpha = 0.5;
        }
    }

    ctx.globalAlpha = bodyAlpha;

    // PowerUp Auras
    if (p.shieldCount > 0) {
        ctx.strokeStyle = COLORS.shield;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.width/2, p.height/2, p.width * 0.8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = COLORS.shield + '33'; 
        ctx.fill();
    }
    if (p.scoreMultiplierActive) {
        let textColor = COLORS.multiplier;
        // Warning flash for Multiplier (Last 3s)
        if (p.scoreMultiplierEndTime && p.scoreMultiplierEndTime - now < 3000 && p.scoreMultiplierEndTime > now) {
             if (Math.floor((p.scoreMultiplierEndTime - now) / 150) % 2 === 0) {
                 textColor = '#EF4444'; // Flash Red
             }
        }

        ctx.fillStyle = textColor;
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText('x2', p.width + 5, 0);
    }
    if (p.isBoosting) {
        // Rocket on back
        ctx.font = '20px Fredoka';
        ctx.textAlign = 'center';
        ctx.fillText('🚀', p.width / 2, -10);
    }
    
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const time = frameCountRef.current * 0.2;
    const isMoving = Math.abs(p.vx) > 0.1;
    const legOffset = (isMoving && gameState === GameState.PLAYING) ? Math.sin(time) * 3 : 0;
    const armOffset = (isMoving && gameState === GameState.PLAYING) ? Math.cos(time) * 5 : 0;

    // Legs
    ctx.beginPath();
    ctx.moveTo(p.width * 0.3, p.height * 0.7); 
    ctx.lineTo(p.width * 0.2, p.height + (legOffset > 0 ? -legOffset : legOffset)); 
    ctx.moveTo(p.width * 0.7, p.height * 0.7);
    ctx.lineTo(p.width * 0.8, p.height + (legOffset < 0 ? legOffset : -legOffset));
    ctx.stroke();

    // Arms
    ctx.beginPath();
    ctx.moveTo(p.width * 0.1, p.height * 0.6);
    ctx.lineTo(-5, p.height * 0.4 + armOffset);
    ctx.moveTo(p.width * 0.9, p.height * 0.6);
    ctx.lineTo(p.width + 5, p.height * 0.4 - armOffset);
    ctx.stroke();

    // Body
    const isFacingLeft = p.vx < -0.1;
    if (isFacingLeft) {
        ctx.translate(p.width, 0);
        ctx.scale(-1, 1);
    }

    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.roundRect(0, 0, p.width, p.height, 8);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.beginPath();
    ctx.roundRect(0, p.height - 5, p.width, 5, 4);
    ctx.fill();
    ctx.fillStyle = bodyColor;

    ctx.beginPath();
    ctx.arc(p.width / 2, 0, 8, Math.PI, 0); 
    ctx.fill();
    
    ctx.beginPath();
    if (p.type === CharacterType.YELLOW) {
        ctx.arc(p.width, p.height / 2, 8, -Math.PI/2, Math.PI/2);
    } else {
        ctx.arc(0, p.height / 2, 8, Math.PI/2, -Math.PI/2);
    }
    ctx.fill();

    // Eyes
    const eyeXOffset = 0; 
    ctx.fillStyle = '#1F2937'; 
    ctx.beginPath();
    ctx.ellipse(p.width * 0.35 + eyeXOffset, p.height * 0.4, 3, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(p.width * 0.65 + eyeXOffset, p.height * 0.4, 3, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = '#FFF';
    ctx.beginPath();
    ctx.arc(p.width * 0.35 + eyeXOffset - 1, p.height * 0.4 - 1, 1.5, 0, Math.PI * 2);
    ctx.arc(p.width * 0.65 + eyeXOffset - 1, p.height * 0.4 - 1, 1.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#F472B6';
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.arc(p.width * 0.2 + eyeXOffset, p.height * 0.5, 4, 0, Math.PI * 2);
    ctx.arc(p.width * 0.8 + eyeXOffset, p.height * 0.5, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Smile
    ctx.strokeStyle = '#1F2937';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(p.width / 2 + eyeXOffset, p.height * 0.48, 6, 0.4, Math.PI - 0.4);
    ctx.stroke();

    // Lightning Bolt
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    const bx = p.width / 2;
    const by = p.height * 0.75;
    const scale = 0.8;
    ctx.save();
    ctx.translate(bx, by);
    ctx.scale(scale, scale);
    ctx.moveTo(0, -6);
    ctx.lineTo(-4, 0);
    ctx.lineTo(-1, 0);
    ctx.lineTo(-2, 6);
    ctx.lineTo(4, -1);
    ctx.lineTo(1, -1);
    ctx.lineTo(3, -6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.restore();

    // Draw countdown text for Booster
    if (p.isBoosting && p.boosterEndTime) {
        const timeLeft = p.boosterEndTime - now;
        if (timeLeft < 3000 && timeLeft > 0) {
             const secondsLeft = Math.ceil(timeLeft / 1000);
             ctx.save();
             ctx.fillStyle = '#EF4444'; 
             ctx.strokeStyle = '#FFFFFF';
             ctx.lineWidth = 2;
             ctx.font = 'bold 24px sans-serif';
             ctx.textAlign = 'center';
             
             // Add a scale pulse
             const scale = 1 + Math.sin(now * 0.02) * 0.2;
             ctx.translate(p.x + p.width / 2, p.y - 25);
             ctx.scale(scale, scale);
             
             // Show WARNING if less than 1s, otherwise show number
             const displayText = secondsLeft <= 1 ? "WARNING!" : secondsLeft.toString() + 's';
             
             ctx.strokeText(displayText, 0, 0);
             ctx.fillText(displayText, 0, 0);
             ctx.restore();
        }
    }
  };

  return (
    <div className="relative group outline-none" style={{ width: '100%', height: '100%', maxWidth: '100%', touchAction: 'none' }}>
      {/* Canvas Logic Container */}
      <canvas 
        ref={canvasRef} 
        width={CANVAS_WIDTH} 
        height={CANVAS_HEIGHT}
        className="rounded-lg shadow-2xl bg-opacity-90 backdrop-blur-sm block w-full h-full object-contain bg-slate-800"
        style={{
          background: 'radial-gradient(circle at center, #1e293b 0%, #0f172a 100%)',
          touchAction: 'none'
        }}
      />
      
    
      
      {gameState === GameState.PLAYING && (
        <>
          {/* Left Button - Fixed position relative to viewport or safely absolute */}
          <button
            className="fixed bottom-6 left-6 w-20 h-20 bg-white/20 hover:bg-white/30 active:bg-white/40 active:scale-95 backdrop-blur-md border border-white/30 rounded-full flex items-center justify-center transition-all z-50 touch-none select-none shadow-lg"
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              keysPressed.current['ArrowLeft'] = true;
            }}
            onPointerUp={(e) => {
              e.preventDefault();
              e.stopPropagation();
              keysPressed.current['ArrowLeft'] = false;
            }}
            onPointerLeave={() => {
              keysPressed.current['ArrowLeft'] = false;
            }}
            onContextMenu={(e) => e.preventDefault()}
            aria-label="Move Left"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-10 h-10 text-white">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
          </button>

          {/* Right Button */}
          <button
            className="fixed bottom-6 right-6 w-20 h-20 bg-white/20 hover:bg-white/30 active:bg-white/40 active:scale-95 backdrop-blur-md border border-white/30 rounded-full flex items-center justify-center transition-all z-50 touch-none select-none shadow-lg"
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              keysPressed.current['ArrowRight'] = true;
            }}
            onPointerUp={(e) => {
              e.preventDefault();
              e.stopPropagation();
              keysPressed.current['ArrowRight'] = false;
            }}
            onPointerLeave={() => {
              keysPressed.current['ArrowRight'] = false;
            }}
            onContextMenu={(e) => e.preventDefault()}
            aria-label="Move Right"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-10 h-10 text-white">
              <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        </>
      )}
    </div>
  );
};
