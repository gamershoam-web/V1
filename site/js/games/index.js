// Arcade registry. Each game module is loaded on demand and default-exports a class:
//   new Game(stageElement, ctx)  ->  ctx = { audio, toast, best, setScore, setInfo, gameOver }
//   game.destroy()               ->  must remove listeners, timers and animation frames.
// `xp` converts score into XP (capped at 250 per run).
export const GAMES = [
  { id: 'wordle', title: 'AstroWordle', icon: '🔠', tag: 'Word', color: '#22d3ee', xp: 0.2,
    desc: 'Crack the 5-letter space word in 6 tries.', load: () => import('./wordle.js') },
  { id: 'sketch', title: 'Nebula Sketch', icon: '🎨', tag: 'Draw', color: '#f472b6', xp: 0.06,
    desc: 'Guess what the AI bot is drawing, or pass & play.', load: () => import('./sketch.js') },
  { id: 'dodger', title: 'Asteroid Dodger', icon: '☄️', tag: 'Action', color: '#f97316', xp: 0.05,
    desc: 'Switch lanes, dodge rocks, grab plasma shields.', load: () => import('./dodger.js') },
  { id: 'pong', title: 'Black Hole Pong', icon: '🕳️', tag: 'Versus', color: '#a855f7', xp: 0.12,
    desc: 'Pong vs AI around a ball-bending gravity well.', load: () => import('./pong.js') },
  { id: 'typing', title: 'Laser Typing Defense', icon: '⌨️', tag: 'Typing', color: '#4ade80', xp: 0.05,
    desc: 'Type the words to blast descending alien ships.', load: () => import('./typing.js') },
  { id: 'q2048', title: 'Quantum 2048', icon: '🪐', tag: 'Puzzle', color: '#facc15', xp: 0.02,
    desc: 'Merge space dust all the way to a supernova.', load: () => import('./q2048.js') },
  { id: 'lander', title: 'Lunar Lander', icon: '🌕', tag: 'Physics', color: '#e2e8f0', xp: 0.08,
    desc: 'Burn fuel wisely and touch down softly on a pad.', load: () => import('./lander.js') },
  { id: 'breaker', title: 'Orbital Brick Breaker', icon: '🧱', tag: 'Arcade', color: '#38bdf8', xp: 0.03,
    desc: 'Smash alien shield bricks with a plasma core.', load: () => import('./breaker.js') },
  { id: 'memory', title: 'Starlight Memory Matrix', icon: '✨', tag: 'Memory', color: '#c084fc', xp: 10,
    desc: 'Repeat the glowing constellation sequences.', load: () => import('./memory.js') },
  { id: 'mines', title: 'Cosmic Minesweeper', icon: '📡', tag: 'Logic', color: '#fb7185', xp: 0.05,
    desc: 'Scan sectors and flag the hidden space mines.', load: () => import('./mines.js') },
  { id: 'invaders', title: 'Galactic Invaders Blitz', icon: '👾', tag: 'Shooter', color: '#34d399', xp: 0.03,
    desc: 'Hold the line against diving alien squadrons.', load: () => import('./invaders.js') },
  { id: 'trivia', title: 'Wormhole Trivia', icon: '🧠', tag: 'Quiz', color: '#60a5fa', xp: 0.06,
    desc: 'Answer fast before your oxygen runs out.', load: () => import('./trivia.js') },
];
