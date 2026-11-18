// Arcade registry. Each game module is loaded on demand and default-exports a class:
//   new Game(stageElement, ctx)  ->  ctx = { audio, toast, best, setScore, setInfo, gameOver,
//                                            reportScore, awardXP, storage, calm }
//   game.destroy()               ->  must remove listeners, timers and animation frames.
//   game.onEscape?()             ->  return true if the game handled Escape (e.g. opened its pause menu).
// `xp` converts score into XP (capped at 250 per run).
export const GAMES = [
  { id: 'wordle', title: 'AstroWordle', tag: 'Word', color: '#22d3ee', xp: 0.2,
    desc: 'Crack the 5-letter space word in 6 tries.', load: () => import('./wordle.js') },
  { id: 'sketch', title: 'Nebula Sketch', tag: 'Draw', color: '#f472b6', xp: 0.06,
    desc: 'Guess what the AI bot is drawing, or pass & play.', load: () => import('./sketch.js') },
  { id: 'dodger', title: 'Asteroid Dodger', tag: 'Action', color: '#f97316', xp: 0.05,
    desc: 'Switch lanes, dodge rocks, grab plasma shields.', load: () => import('./dodger.js') },
  { id: 'pong', title: 'Black Hole Pong', tag: 'Versus', color: '#a855f7', xp: 0.12,
    desc: 'Pong vs AI around a ball-bending gravity well.', load: () => import('./pong.js') },
  { id: 'typing', title: 'Laser Typing Defense', tag: 'Typing', color: '#4ade80', xp: 0.05,
    desc: 'Type the words to blast descending alien ships.', load: () => import('./typing.js') },
  { id: 'q2048', title: 'Quantum 2048', tag: 'Puzzle', color: '#facc15', xp: 0.02,
    desc: 'Merge space dust all the way to a supernova.', load: () => import('./q2048.js') },
  { id: 'lander', title: 'Lunar Lander', tag: 'Physics', color: '#a5b4fc', xp: 0.08,
    desc: 'Burn fuel wisely and touch down softly on a pad.', load: () => import('./lander.js') },
  { id: 'breaker', title: 'Orbital Brick Breaker', tag: 'Arcade', color: '#38bdf8', xp: 0.03,
    desc: 'Smash alien shield bricks with a plasma core.', load: () => import('./breaker.js') },
  { id: 'memory', title: 'Starlight Memory Matrix', tag: 'Memory', color: '#c084fc', xp: 10,
    desc: 'Repeat the glowing constellation sequences.', load: () => import('./memory.js') },
  { id: 'mines', title: 'Cosmic Minesweeper', tag: 'Logic', color: '#fb7185', xp: 0.05,
    desc: 'Scan sectors and flag the hidden space mines.', load: () => import('./mines.js') },
  { id: 'invaders', title: 'Galactic Invaders Blitz', tag: 'Shooter', color: '#34d399', xp: 0.03,
    desc: 'Hold the line against diving alien squadrons.', load: () => import('./invaders.js') },
  { id: 'trivia', title: 'Wormhole Trivia', tag: 'Quiz', color: '#60a5fa', xp: 0.06,
    desc: 'Answer fast before your oxygen runs out.', load: () => import('./trivia.js') },
];

// Full-size games: bigger, longer sessions with saves. `progress(save)` summarises a saved game for the card.
export const FULL_GAMES = [
  {
    id: 'starfighter', title: 'Starfighter: Void Siege', tag: '3D Action', color: '#38bdf8', xp: 0.02, big: true,
    desc: 'Fly a fighter in full 3D and defend Orbit Station against ten waves of raiders, bombers and a capital-ship boss.',
    features: ['Full 3D space flight', '10 waves + boss battles', 'Hangar upgrades & missiles'],
    progress: (save) => (save?.bestWave ? `Best: wave ${save.bestWave}${save.won ? ' · Victory' : ''}` : 'New pilot'),
    load: () => import('./big/starfighter.js'),
  },
  {
    id: 'conquest', title: 'Galactic Conquest', tag: 'Strategy', color: '#f472b6', xp: 0.01, big: true,
    desc: 'Command fleets, capture worlds and outsmart rival AI empires across a 12-sector campaign.',
    features: ['12-sector campaign', 'Rival AI empires', 'Forge, fortress & relay worlds'],
    progress: (save) => {
      const done = save?.cleared ? Object.keys(save.cleared).length : 0;
      const stars = save?.cleared ? Object.values(save.cleared).reduce((a, b) => a + b, 0) : 0;
      return done ? `${done}/12 sectors · ${stars}★` : 'Campaign not started';
    },
    load: () => import('./big/conquest.js'),
  },
  {
    id: 'colony', title: 'Orbit Colony', tag: 'Builder', color: '#4ade80', xp: 0.002, big: true, restart: false,
    desc: 'Build and run a space mining colony: construct modules, research tech, trade, launch expeditions and warp to new systems.',
    features: ['Progress saves automatically', 'Research tree & expeditions', 'Keeps producing while you are away'],
    progress: (save) => (save?.started ? `Colony level ${save.level || 1} · System ${(save.warps || 0) + 1}` : 'Found your colony'),
    load: () => import('./big/colony.js'),
  },
];

export const ALL_GAMES = [...FULL_GAMES, ...GAMES];
