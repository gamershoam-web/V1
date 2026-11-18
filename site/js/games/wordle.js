// AstroWordle — 6 tries to guess a 5-letter space/gaming word.
const WORDS = `ORBIT COMET ALIEN LASER ROVER SOLAR LUNAR STARS SPACE PROBE SHIPS CRAFT PIXEL GAMER LEVEL QUEST
SWORD BLOCK STONE TORCH CHEST ARMOR MAGMA OCEAN EARTH VENUS PLUTO TITAN GIANT DWARF QUARK PHASE DRIFT BOOST FLARE
BLAZE SPARK POWER SCORE COMBO ARENA SPAWN WITCH GHAST SLIME NINJA ROBOT CYBER HYPER ALPHA OMEGA DELTA SIGMA GAMMA
PULSE LIGHT NIGHT FROST STORM CLOUD WORLD REALM RADAR SONAR MINER ANVIL EMBER ASTRO NOVAE MOONS SKIES TRAIL ENDER
BIOME RELIC BONUS LOBBY GUILD RAIDS CRASH LUNAR VAPOR GLOWS ORBIT METAL OXIDE ATOMS FORGE CABIN TOWER`
  .split(/\s+/).filter((w) => /^[A-Z]{5}$/.test(w));
const ANSWERS = [...new Set(WORDS)];

const ROWS = ['QWERTYUIOP', 'ASDFGHJKL', '⏎ZXCVBNM⌫'];

export default class AstroWordle {
  constructor(root, ctx) {
    this.root = root; this.ctx = ctx;
    this.answer = ANSWERS[Math.floor(Math.random() * ANSWERS.length)];
    this.guesses = [];
    this.current = '';
    this.locked = false;
    this.keyState = {};
    this.timers = [];

    root.innerHTML = `
      <div class="wordle">
        <p class="text-xs text-slate-400 tracking-wider text-center">Guess the hidden <b class="text-neon-cyan">space or gaming</b> word in 6 tries</p>
        <div class="wordle-board">${Array.from({ length: 6 }, () => `<div class="wordle-row">${'<div class="tile"></div>'.repeat(5)}</div>`).join('')}</div>
        <div class="wordle-kb">${ROWS.map((r) => `<div class="kb-row">${[...r].map((k) => {
          const label = k === '⏎' ? 'Enter' : k === '⌫' ? '⌫' : k;
          const key = k === '⏎' ? 'Enter' : k === '⌫' ? 'Backspace' : k;
          return `<button type="button" data-key="${key}" class="${k === '⏎' || k === '⌫' ? 'wide' : ''}" aria-label="${key}">${label}</button>`;
        }).join('')}</div>`).join('')}</div>
      </div>`;
    this.rows = [...root.querySelectorAll('.wordle-row')];
    root.querySelectorAll('[data-key]').forEach((b) => b.addEventListener('click', () => this.press(b.dataset.key)));
    this.onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Enter' || e.key === 'Backspace' || /^[a-z]$/i.test(e.key)) { e.preventDefault(); this.press(e.key.length === 1 ? e.key.toUpperCase() : e.key); }
    };
    window.addEventListener('keydown', this.onKey);
    ctx.setInfo('6 attempts');
  }

  press(key) {
    if (this.locked) return;
    if (key === 'Enter') return this.submit();
    if (key === 'Backspace') { this.current = this.current.slice(0, -1); this.paint(); return; }
    if (/^[A-Z]$/.test(key) && this.current.length < 5) {
      this.current += key;
      this.ctx.audio.hover();
      this.paint();
    }
  }

  paint() {
    const row = this.rows[this.guesses.length];
    if (!row) return;
    [...row.children].forEach((t, i) => {
      t.textContent = this.current[i] || '';
      t.classList.toggle('filled', !!this.current[i]);
    });
  }

  evaluate(guess) {
    const res = Array(5).fill('absent');
    const counts = {};
    for (let i = 0; i < 5; i++) {
      if (guess[i] === this.answer[i]) res[i] = 'correct';
      else counts[this.answer[i]] = (counts[this.answer[i]] || 0) + 1;
    }
    for (let i = 0; i < 5; i++) {
      if (res[i] !== 'correct' && counts[guess[i]] > 0) { res[i] = 'present'; counts[guess[i]]--; }
    }
    return res;
  }

  submit() {
    const row = this.rows[this.guesses.length];
    if (this.current.length < 5) {
      row.classList.remove('shake'); void row.offsetWidth; row.classList.add('shake');
      this.ctx.audio.error();
      this.ctx.toast('Not enough letters', { type: 'error' });
      return;
    }
    const guess = this.current;
    const res = this.evaluate(guess);
    this.guesses.push(guess);
    this.current = '';
    this.locked = true;
    const tiles = [...row.children];
    tiles.forEach((t, i) => {
      this.timers.push(setTimeout(() => { t.classList.add('flip'); this.ctx.audio.tone({ freq: 400 + i * 80, type: 'triangle', dur: 0.08, vol: 0.08 }); }, i * 280));
      this.timers.push(setTimeout(() => t.classList.add(res[i]), i * 280 + 250));
    });
    this.timers.push(setTimeout(() => {
      const rank = { absent: 1, present: 2, correct: 3 };
      [...guess].forEach((ch, i) => {
        if ((rank[res[i]] || 0) > (rank[this.keyState[ch]] || 0)) this.keyState[ch] = res[i];
      });
      this.root.querySelectorAll('[data-key]').forEach((b) => {
        const s = this.keyState[b.dataset.key];
        if (s) { b.classList.remove('absent', 'present', 'correct'); b.classList.add(s); }
      });
      const won = guess === this.answer;
      const tries = this.guesses.length;
      this.ctx.setInfo(`${6 - tries} attempts left`);
      if (won) {
        row.classList.add('win');
        const score = (7 - tries) * 100;
        this.ctx.setScore(score);
        this.timers.push(setTimeout(() => this.ctx.gameOver(score, { won: true, title: 'Word decoded!', message: `You found ${this.answer} in ${tries} ${tries === 1 ? 'try' : 'tries'}.` }), 900));
      } else if (tries >= 6) {
        this.timers.push(setTimeout(() => this.ctx.gameOver(0, { title: 'Signal lost', message: `The word was ${this.answer}.` }), 600));
      } else {
        this.locked = false;
      }
    }, 5 * 280 + 300));
  }

  destroy() {
    window.removeEventListener('keydown', this.onKey);
    this.timers.forEach(clearTimeout);
    this.root.innerHTML = '';
  }
}
