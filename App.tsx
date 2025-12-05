
import React, { useState, useEffect, useCallback } from 'react';
import { GameCanvas } from './components/GameCanvas';
import { GameState, CharacterType, LeaderboardEntry } from './types';
import { generateGameOverMessage } from './services/geminiService';
import { saveScoreToFirestore, getLeaderboardFromFirestore, checkOnlineStatus } from './services/firebase';
import { COLORS, SCORE_TIERS, CHARACTER_SPECS } from './constants';

const MAX_LEADERBOARD_ENTRIES = 20;

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>(GameState.START);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [character, setCharacter] = useState<CharacterType>(CharacterType.YELLOW);
  const [gameOverMessage, setGameOverMessage] = useState<string>('');
  const [loadingMsg, setLoadingMsg] = useState(false);
  const [resetTrigger, setResetTrigger] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  
  // Leaderboard State
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [isNewRecord, setIsNewRecord] = useState(false);
  const [playerName, setPlayerName] = useState('');
  const [isLoadingLeaderboard, setIsLoadingLeaderboard] = useState(false);
  const [isOnline, setIsOnline] = useState(false);

  // Help Modal State
  const [showHelp, setShowHelp] = useState(false);

  // Load Leaderboard function
  const fetchLeaderboard = useCallback(async () => {
    setIsLoadingLeaderboard(true);
    // Check connection status
    const online = await checkOnlineStatus();
    setIsOnline(online);
    
    const data = await getLeaderboardFromFirestore(MAX_LEADERBOARD_ENTRIES);
    setLeaderboard(data);
    if (data.length > 0) {
      setHighScore(data[0].score);
    }
    setIsLoadingLeaderboard(false);
  }, []);

  // Initial Load
  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  const handleScoreUpdate = useCallback((newScore: number) => {
    const actualScore = Math.floor(newScore / 10);
    setScore(actualScore);
  }, []);

  const handleGameOver = useCallback(async () => {
    setGameState(GameState.GAME_OVER);
    
    // Refresh leaderboard to check against latest data
    await fetchLeaderboard();
    
    const latestData = await getLeaderboardFromFirestore(MAX_LEADERBOARD_ENTRIES);
    setLeaderboard(latestData);

    const lowestScore = latestData.length < MAX_LEADERBOARD_ENTRIES 
      ? 0 
      : latestData[latestData.length - 1].score;
      
    if (score > 0 && (latestData.length < MAX_LEADERBOARD_ENTRIES || score > lowestScore)) {
      setIsNewRecord(true);
      setShowLeaderboard(false);
    } else {
      setIsNewRecord(false);
    }

    // Optional: Fetch fun message from Gemini
    if (process.env.API_KEY) {
      setLoadingMsg(true);
      const msg = await generateGameOverMessage(score);
      setGameOverMessage(msg);
      setLoadingMsg(false);
    } else {
        setGameOverMessage("Awesome run! Can you beat it?");
    }
  }, [score, fetchLeaderboard]);

  const submitScore = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Default to "익명" if empty
    const finalName = playerName.trim() || "익명";

    const newEntry: Omit<LeaderboardEntry, 'timestamp'> = {
      name: finalName.substring(0, 10), // Limit name length
      score: score,
      character: character
    };

    setIsLoadingLeaderboard(true);
    await saveScoreToFirestore(newEntry);
    await fetchLeaderboard(); // Refresh list after saving
    setIsLoadingLeaderboard(false);

    setIsNewRecord(false);
    setShowLeaderboard(true);
  };

  const skipScore = () => {
      setIsNewRecord(false);
      setShowLeaderboard(true);
  };

  const startGame = () => {
    setScore(0);
    setGameOverMessage('');
    setGameState(GameState.PLAYING);
    setIsNewRecord(false);
    setShowLeaderboard(false);
    setShowHelp(false);
    setPlayerName('');
    setResetTrigger(prev => prev + 1); // Trigger reset in canvas
  };

  return (
    <div className="h-[100dvh] w-full bg-slate-950 flex flex-col items-center overflow-hidden font-sans select-none touch-none">
      
      {/* Top Right Controls (Absolute) */}
      <div className="absolute top-4 right-4 z-50 flex gap-2">
        {/* Help Button */}
        <button 
          onClick={() => setShowHelp(true)}
          className="p-2 bg-slate-800/80 rounded-full text-white hover:bg-slate-700 transition-colors border border-slate-700 w-10 h-10 flex items-center justify-center font-bold"
          title="Game Guide"
        >
          ?
        </button>

        {/* Sound Toggle Button */}
        <button 
          onClick={() => setIsMuted(!isMuted)}
          className="p-2 bg-slate-800/80 rounded-full text-white hover:bg-slate-700 transition-colors border border-slate-700 w-10 h-10 flex items-center justify-center"
          title={isMuted ? "Unmute" : "Mute"}
        >
          {isMuted ? (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75 19.5 12m0 0 2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6 4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
            </svg>
          )}
        </button>
      </div>

      {/* Header Section - Shrink-0 to prevent compression */}
      <div className="shrink-0 mt-14 mb-4 text-center px-4 z-10 w-full">
        <h1 className="text-xl md:text-3xl font-black tracking-wide mb-1 drop-shadow-lg text-white leading-tight">
          <span style={{ color: COLORS.yellowBody }}>스파키</span>와 <span style={{ color: COLORS.blueBody }}>유니</span>가 함께하는<br />
          <span className="text-2xl md:text-4xl mt-1 block">점핑게임</span>
        </h1>
        <p className="text-slate-400 font-bold tracking-widest text-xs md:text-sm">전국전력노동조합</p>
      </div>

      {/* Game Area Container - Flex-1 to fill space, but with bottom padding for buttons */}
      <div className="flex-1 w-full min-h-0 flex items-center justify-center px-4 pb-36">
        <div className="relative w-full max-w-md h-full max-h-full aspect-[2/3]">
          
          {/* Game Canvas */}
          <GameCanvas 
            gameState={gameState} 
            characterType={character}
            onScoreUpdate={handleScoreUpdate}
            onGameOver={handleGameOver}
            resetTrigger={resetTrigger}
            isMuted={isMuted}
          />

          {/* UI Overlay: Score HUD */}
          <div className="absolute top-4 left-4 right-4 flex justify-between items-start pointer-events-none z-10">
            <div className="bg-slate-800/80 p-2 rounded-lg border border-slate-700 backdrop-blur-sm">
              <span className="text-xs text-slate-400 block uppercase">Score</span>
              <span className="text-2xl font-bold text-white">{score}</span>
            </div>
            <div className="bg-slate-800/80 p-2 rounded-lg border border-slate-700 text-right backdrop-blur-sm">
              <span className="text-xs text-slate-400 block uppercase">Top Score</span>
              <span className="text-xl font-bold text-yellow-400">{highScore}</span>
            </div>
          </div>

          {/* UI Overlay: Start Screen */}
          {gameState === GameState.START && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/90 backdrop-blur-sm rounded-lg z-20 p-6 text-center animate-fadeIn">
              <h2 className="text-2xl text-white font-bold mb-6">캐릭터 선택</h2>
              
              <div className="flex gap-6 mb-8 w-full justify-center">
                {/* Sparky Selection */}
                <div className="flex flex-col items-center w-36">
                  <button 
                    onClick={() => setCharacter(CharacterType.YELLOW)}
                    className={`w-28 h-28 rounded-2xl flex items-center justify-center transition-all transform hover:scale-105 border-4 mb-2 ${character === CharacterType.YELLOW ? 'border-white shadow-[0_0_20px_rgba(252,211,77,0.5)] scale-110 z-10' : 'border-transparent opacity-60 grayscale-[0.5]'}`}
                    style={{ backgroundColor: COLORS.yellowBody }}
                  >
                    <svg viewBox="0 0 50 50" className="w-20 h-20 fill-slate-900">
                      <path d="M 15 40 L 12 48" stroke="black" strokeWidth="2" strokeLinecap="round" />
                      <path d="M 35 40 L 38 48" stroke="black" strokeWidth="2" strokeLinecap="round" />
                      <path d="M 10 30 L 5 20" stroke="black" strokeWidth="2" strokeLinecap="round" />
                      <path d="M 40 30 L 45 20" stroke="black" strokeWidth="2" strokeLinecap="round" />
                      <rect x="10" y="10" width="30" height="30" rx="5" fill={COLORS.yellowBody}/>
                      <circle cx="25" cy="10" r="6" fill={COLORS.yellowBody}/>
                      <circle cx="40" cy="25" r="6" fill={COLORS.yellowBody}/>
                      <circle cx="20" cy="22" r="2.5" fill="#1F2937" />
                      <circle cx="30" cy="22" r="2.5" fill="#1F2937" />
                      <path d="M 20 28 Q 25 32 30 28" stroke="#1F2937" strokeWidth="2" fill="none" strokeLinecap="round"/>
                      <path d="M 25 33 L 23 38 L 25 38 L 24 42 L 28 37 L 26 37 Z" fill="white" />
                    </svg>
                  </button>
                  <span className="text-yellow-400 font-bold text-xl drop-shadow-md">스파키</span>
                  
                  {/* Ability Badge */}
                  <div className="mt-2 px-2 py-1.5 bg-yellow-500/10 border border-yellow-500/30 rounded-lg backdrop-blur-sm w-full">
                    <div className="text-[10px] text-yellow-500 font-bold uppercase tracking-wider mb-0.5 text-center">ABILITY</div>
                    <div className="text-xs text-yellow-100 font-medium leading-tight text-center whitespace-pre-wrap">
                        {CHARACTER_SPECS[CharacterType.YELLOW].description}
                    </div>
                  </div>
                </div>

                {/* Uni Selection */}
                <div className="flex flex-col items-center w-36">
                  <button 
                    onClick={() => setCharacter(CharacterType.BLUE)}
                    className={`w-28 h-28 rounded-2xl flex items-center justify-center transition-all transform hover:scale-105 border-4 mb-2 ${character === CharacterType.BLUE ? 'border-white shadow-[0_0_20px_rgba(94,234,212,0.5)] scale-110 z-10' : 'border-transparent opacity-60 grayscale-[0.5]'}`}
                    style={{ backgroundColor: COLORS.blueBody }}
                  >
                    <svg viewBox="0 0 50 50" className="w-20 h-20 fill-slate-900">
                      <path d="M 15 40 L 12 48" stroke="black" strokeWidth="2" strokeLinecap="round" />
                      <path d="M 35 40 L 38 48" stroke="black" strokeWidth="2" strokeLinecap="round" />
                      <path d="M 10 30 L 5 20" stroke="black" strokeWidth="2" strokeLinecap="round" />
                      <path d="M 40 30 L 45 20" stroke="black" strokeWidth="2" strokeLinecap="round" />
                        <rect x="10" y="10" width="30" height="30" rx="5" fill={COLORS.blueBody}/>
                        <circle cx="25" cy="10" r="6" fill={COLORS.blueBody}/>
                        <circle cx="10" cy="25" r="6" fill={COLORS.blueBody}/>
                        <circle cx="20" cy="22" r="2.5" fill="#1F2937" />
                        <circle cx="30" cy="22" r="2.5" fill="#1F2937" />
                        <path d="M 20 28 Q 25 32 30 28" stroke="#1F2937" strokeWidth="2" fill="none" strokeLinecap="round"/>
                        <path d="M 25 33 L 23 38 L 25 38 L 24 42 L 28 37 L 26 37 Z" fill="white" />
                    </svg>
                  </button>
                  <span className="text-teal-400 font-bold text-xl drop-shadow-md">유니</span>
                  
                  {/* Ability Badge */}
                  <div className="mt-2 px-2 py-1.5 bg-teal-500/10 border border-teal-500/30 rounded-lg backdrop-blur-sm w-full">
                    <div className="text-[10px] text-teal-500 font-bold uppercase tracking-wider mb-0.5 text-center">ABILITY</div>
                    <div className="text-xs text-teal-100 font-medium leading-tight text-center whitespace-pre-wrap">
                        {CHARACTER_SPECS[CharacterType.BLUE].description}
                    </div>
                  </div>
                </div>
              </div>

              <button 
                onClick={startGame}
                className="px-12 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full text-xl font-black text-white shadow-xl hover:from-blue-500 hover:to-indigo-500 hover:scale-105 transition-all active:scale-95 animate-pulse mt-4 ring-4 ring-blue-500/20"
              >
                GAME START
              </button>
            </div>
          )}

          {/* UI Overlay: Game Over */}
          {gameState === GameState.GAME_OVER && !showLeaderboard && !isNewRecord && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/90 backdrop-blur-sm rounded-lg z-20 p-6 text-center animate-fadeIn">
              <h2 className="text-4xl text-white font-black mb-2">GAME OVER</h2>
              <p className="text-slate-400 mb-6 font-medium">
                {loadingMsg ? "Thinking of something witty..." : gameOverMessage}
              </p>
              
              <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700 mb-8 w-full max-w-xs">
                <div className="text-slate-400 text-sm uppercase tracking-wider mb-1">Final Score</div>
                <div className="text-5xl font-black text-white">{score}</div>
              </div>

              <div className="flex flex-col gap-3 w-full max-w-xs">
                <button 
                  onClick={startGame}
                  className="w-full py-4 bg-yellow-500 hover:bg-yellow-400 text-slate-900 rounded-xl font-bold text-lg transition-transform active:scale-95 shadow-lg"
                >
                  Try Again
                </button>
                <button 
                  onClick={() => setGameState(GameState.START)}
                  className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-lg transition-transform active:scale-95 shadow-lg"
                >
                  Change Character
                </button>
                <button 
                  onClick={() => setShowLeaderboard(true)}
                  className="w-full py-4 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold text-lg transition-transform active:scale-95"
                >
                  Leaderboard
                </button>
              </div>
            </div>
          )}

          {/* UI Overlay: New Record Input */}
          {gameState === GameState.GAME_OVER && isNewRecord && !showLeaderboard && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/95 backdrop-blur-md rounded-lg z-30 p-6 text-center animate-fadeIn">
              <h2 className="text-3xl text-yellow-400 font-black mb-2">NEW RECORD!</h2>
              <p className="text-slate-300 mb-6">You made it to the Top 20!</p>
              
              <div className="bg-slate-800/50 p-4 rounded-xl border border-yellow-500/30 mb-6 w-full max-w-xs">
                <div className="text-5xl font-black text-white">{score}</div>
              </div>

              <form onSubmit={submitScore} className="w-full max-w-xs flex flex-col gap-4">
                <div className="text-left">
                  <label className="text-slate-400 text-sm ml-1 mb-1 block">Enter Name (선택)</label>
                  <input 
                    type="text" 
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    placeholder="Anonymous"
                    className="w-full bg-slate-800 border-2 border-slate-600 focus:border-blue-500 rounded-xl px-4 py-3 text-white outline-none font-bold text-lg text-center placeholder-slate-600"
                    maxLength={10}
                    autoFocus
                  />
                </div>
                <button 
                  type="submit"
                  disabled={isLoadingLeaderboard}
                  className="w-full py-3 bg-blue-500 hover:bg-blue-400 text-white rounded-xl font-bold text-lg transition-transform active:scale-95 shadow-lg mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoadingLeaderboard ? 'Saving...' : 'Save Score'}
                </button>
                <button 
                  type="button"
                  onClick={skipScore}
                  className="w-full py-2 bg-transparent text-slate-500 hover:text-slate-300 font-medium text-sm transition-colors"
                >
                  건너뛰기 (Skip)
                </button>
              </form>
            </div>
          )}

          {/* UI Overlay: Leaderboard */}
          {showLeaderboard && (
            <div className="absolute inset-0 flex flex-col bg-slate-900/95 backdrop-blur-md rounded-lg z-30 p-6 animate-fadeIn">
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-2">
                  <h2 className="text-xl md:text-2xl text-white font-black tracking-tight text-left">
                    {isOnline ? "GLOBAL RANKINGS" : "LOCAL RANKINGS"}
                  </h2>
                  {!isOnline && (
                    <span className="text-xs text-slate-500 bg-slate-800 px-2 py-1 rounded">OFFLINE MODE</span>
                  )}
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                {isLoadingLeaderboard ? (
                   <div className="text-slate-400 text-center py-10 animate-pulse">Loading rankings...</div>
                ) : leaderboard.length === 0 ? (
                  <div className="text-slate-500 text-center py-10">No records yet.<br/>Be the first!</div>
                ) : (
                  <table className="w-full text-left border-collapse">
                    <thead className="text-xs text-slate-500 uppercase sticky top-0 bg-slate-900">
                      <tr>
                        <th className="pb-2 pl-2">#</th>
                        <th className="pb-2">Name</th>
                        <th className="pb-2 text-right pr-2">Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leaderboard.map((entry, index) => (
                        <tr key={index} className={`border-b border-slate-800 ${index < 3 ? 'text-white font-bold' : 'text-slate-400'}`}>
                          <td className="py-3 pl-2">
                            {index === 0 && '🥇'}
                            {index === 1 && '🥈'}
                            {index === 2 && '🥉'}
                            {index > 2 && index + 1}
                          </td>
                          <td className="py-3 flex items-center gap-2">
                            <div 
                              className="w-3 h-3 rounded-full" 
                              style={{ backgroundColor: entry.character === CharacterType.YELLOW ? COLORS.yellowBody : COLORS.blueBody }} 
                            />
                            {entry.name}
                          </td>
                          <td className="py-3 text-right pr-2 font-mono text-lg">{entry.score}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              
              {!isOnline && (
                <div className="mt-2 text-xs text-slate-600 text-center border-t border-slate-800 pt-2">
                  To enable global rankings, configure /public/firebase.json on your server.
                </div>
              )}

              <div className="mt-4 flex flex-col gap-3">
                <button 
                  onClick={startGame}
                  className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-lg transition-transform active:scale-95 shadow-lg"
                >
                  Play Again
                </button>
                <button 
                  onClick={() => setGameState(GameState.START)}
                  className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold transition-colors"
                >
                  Home
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Help Modal */}
        {showHelp && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn" onClick={() => setShowHelp(false)}>
            <div className="bg-slate-900 border border-slate-700 w-full max-w-md max-h-[80vh] rounded-2xl p-6 shadow-2xl relative flex flex-col" onClick={e => e.stopPropagation()}>
              <button 
                onClick={() => setShowHelp(false)}
                className="absolute top-4 right-4 text-slate-500 hover:text-white"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              
              <h3 className="text-xl text-white font-bold mb-4 flex items-center gap-2 shrink-0">
                <span className="text-2xl">📖</span> 게임 가이드 (찬이가 만듬ㅎ)
              </h3>
              
              <div className="space-y-6 text-slate-300 overflow-y-auto custom-scrollbar pr-2 flex-1">
                <div>
                  <h4 className="text-white font-semibold mb-2 border-b border-slate-700 pb-1">🕹️ 조작 방법</h4>
                  <ul className="list-disc pl-5 space-y-1 text-sm">
                    <li><span className="text-yellow-400">PC:</span> 방향키(←, →) 또는 A, D 키</li>
                    <li><span className="text-teal-400">Mobile:</span> 화면 하단 좌우 버튼 터치</li>
                  </ul>
                </div>

                <div>
                  <h4 className="text-white font-semibold mb-2 border-b border-slate-700 pb-1">🦸 캐릭터 능력 (Abilities)</h4>
                  <div className="grid grid-cols-1 gap-2">
                    <div className="flex items-center gap-3 bg-slate-800/50 p-2 rounded-lg">
                        <div className="w-10 h-10 rounded-lg flex items-center justify-center border border-white/20" style={{ backgroundColor: COLORS.yellowBody }}>
                            <span className="text-xl">⚡</span>
                        </div>
                        <div>
                            <div className="font-bold text-yellow-400 text-sm">스파키 (Sparky)</div>
                            <div className="text-xs text-slate-300">{CHARACTER_SPECS[CharacterType.YELLOW].description}</div>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 bg-slate-800/50 p-2 rounded-lg">
                        <div className="w-10 h-10 rounded-lg flex items-center justify-center border border-white/20" style={{ backgroundColor: COLORS.blueBody }}>
                            <span className="text-xl">💧</span>
                        </div>
                        <div>
                            <div className="font-bold text-teal-400 text-sm">유니 (Uni)</div>
                            <div className="text-xs text-slate-300">{CHARACTER_SPECS[CharacterType.BLUE].description}</div>
                        </div>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="text-white font-semibold mb-2 border-b border-slate-700 pb-1">✨ 아이템 도감</h4>
                  <div className="grid grid-cols-1 gap-3">
                    <div className="flex items-center gap-3 bg-slate-800/50 p-2 rounded-lg">
                       <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center text-xl shrink-0 border border-blue-500/50">🛡️</div>
                       <div>
                         <div className="font-bold text-blue-300 text-sm">보호막 (Shield)</div>
                         <div className="text-xs text-slate-400">추락 시 1회 부활합니다. (최대 3개 누적)</div>
                       </div>
                    </div>
                    
                    {/* Double Jump Removed */}

                    <div className="flex items-center gap-3 bg-slate-800/50 p-2 rounded-lg">
                       <div className="w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center text-xl shrink-0 border border-yellow-500/50">⭐</div>
                       <div>
                         <div className="font-bold text-yellow-300 text-sm">점수 2배 (x2 Score)</div>
                         <div className="text-xs text-slate-400">10초간 획득 점수가 2배가 됩니다.</div>
                       </div>
                    </div>
                    <div className="flex items-center gap-3 bg-slate-800/50 p-2 rounded-lg">
                       <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center text-xl shrink-0 border border-emerald-500/50">🍄</div>
                       <div>
                         <div className="font-bold text-emerald-300 text-sm">거대화 (Giant)</div>
                         <div className="text-xs text-slate-400">5초간 커져서 발판 밟기가 쉬워집니다.</div>
                       </div>
                    </div>
                    <div className="flex items-center gap-3 bg-slate-800/50 p-2 rounded-lg">
                       <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center text-xl shrink-0 border border-red-500/50">🚀</div>
                       <div>
                         <div className="font-bold text-red-400 text-sm">부스터 (Rocket)</div>
                         <div className="text-xs text-slate-400">3초간 위로 빠르게 상승합니다.</div>
                       </div>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="text-white font-semibold mb-2 border-b border-slate-700 pb-1">🌈 발판 점수 (Platform Tiers)</h4>
                  <div className="grid grid-cols-1 gap-2">
                    {SCORE_TIERS.map((tier, index) => (
                      <div key={index} className="flex items-center gap-3 bg-slate-800/50 p-2 rounded-lg">
                        <div 
                          className="w-8 h-4 rounded border border-white/20" 
                          style={{ backgroundColor: tier.color }} 
                        />
                        <div className="flex-1">
                          <div className="font-bold text-white text-sm">
                            {index === 0 ? "기본 (Basic)" : `Level ${index + 1}`}
                          </div>
                          <div className="text-xs text-slate-400">
                            점수 <span className="text-yellow-400 font-bold">x{tier.multiplier}</span> (높이 {tier.min}+)
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              
              <button 
                onClick={() => setShowHelp(false)}
                className="w-full mt-6 py-3 bg-slate-700 hover:bg-slate-600 rounded-xl text-white font-bold shrink-0"
              >
                닫기
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default App;
