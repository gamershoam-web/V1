// Wormhole Trivia — rapid-fire quiz with a depleting oxygen supply.
const BANK = [
  // Astronomy
  ['Astronomy', 'Which planet is known as the Red Planet?', 'Mars', ['Venus', 'Jupiter', 'Mercury']],
  ['Astronomy', 'What is the largest planet in our solar system?', 'Jupiter', ['Saturn', 'Neptune', 'Earth']],
  ['Astronomy', 'What is the closest star to the Sun?', 'Proxima Centauri', ['Sirius', 'Betelgeuse', 'Polaris']],
  ['Astronomy', 'Roughly how long does sunlight take to reach Earth?', 'About 8 minutes', ['About 8 seconds', 'About 1 hour', 'About 1 day']],
  ['Astronomy', 'What is the name of our galaxy?', 'The Milky Way', ['Andromeda', 'Triangulum', 'Whirlpool']],
  ['Astronomy', 'Which is the hottest planet in our solar system?', 'Venus', ['Mercury', 'Mars', 'Jupiter']],
  ['Astronomy', 'Which planet rotates on its side?', 'Uranus', ['Neptune', 'Saturn', 'Mars']],
  ['Astronomy', 'What is the largest moon in the solar system?', 'Ganymede', ['Titan', 'Europa', 'The Moon']],
  ['Astronomy', 'Which body was reclassified as a dwarf planet in 2006?', 'Pluto', ['Ceres', 'Eris', 'Neptune']],
  ['Astronomy', 'A light-year is a measure of…', 'Distance', ['Time', 'Brightness', 'Speed']],
  ['Astronomy', 'What gas makes up most of the Sun?', 'Hydrogen', ['Helium', 'Oxygen', 'Carbon']],
  ['Astronomy', 'Which planet has the shortest year?', 'Mercury', ['Venus', 'Mars', 'Earth']],
  ['Astronomy', 'Who was the first person to walk on the Moon?', 'Neil Armstrong', ['Buzz Aldrin', 'Yuri Gagarin', 'John Glenn']],
  ['Astronomy', 'In what year did Apollo 11 land on the Moon?', '1969', ['1965', '1972', '1959']],
  ['Astronomy', 'Which space telescope launched in December 2021?', 'James Webb', ['Hubble', 'Kepler', 'Spitzer']],
  ['Astronomy', 'Which galaxy is on a collision course with the Milky Way?', 'Andromeda', ['Sombrero', 'Large Magellanic Cloud', 'Cartwheel']],
  ['Astronomy', 'Who was the first human in space?', 'Yuri Gagarin', ['Alan Shepard', 'Neil Armstrong', 'Valentina Tereshkova']],
  // Sci-fi
  ['Sci-Fi', "What is the name of Han Solo's ship in Star Wars?", 'Millennium Falcon', ['Star Destroyer', 'X-Wing', 'Slave I']],
  ['Sci-Fi', 'HAL 9000 is the AI in which film?', '2001: A Space Odyssey', ['Alien', 'Blade Runner', 'Interstellar']],
  ['Sci-Fi', "In The Hitchhiker's Guide to the Galaxy, what is the answer to life, the universe and everything?", '42', ['7', '101', '0']],
  ['Sci-Fi', 'Which planet is Superman originally from?', 'Krypton', ['Vulcan', 'Tatooine', 'Arrakis']],
  ['Sci-Fi', 'In Dune, the spice is harvested on which planet?', 'Arrakis', ['Caladan', 'Giedi Prime', 'Kaitain']],
  ['Sci-Fi', 'Who captains the USS Enterprise in the original Star Trek series?', 'James T. Kirk', ['Jean-Luc Picard', 'Kathryn Janeway', 'Benjamin Sisko']],
  ['Sci-Fi', 'Who wrote the novel The War of the Worlds?', 'H. G. Wells', ['Jules Verne', 'Isaac Asimov', 'Arthur C. Clarke']],
  ['Sci-Fi', "What is the name of Master Chief's AI companion in Halo?", 'Cortana', ['Siri', 'GLaDOS', 'EDI']],
  ['Sci-Fi', 'What is the name of the ship in the 1979 film Alien?', 'Nostromo', ['Sulaco', 'Prometheus', 'Serenity']],
  ['Sci-Fi', 'In Interstellar, what is the name of the witty robot with an adjustable humor setting?', 'TARS', ['CASE', 'KIPP', 'HAL']],
  ['Sci-Fi', "The Vulcan salute goes with which phrase?", 'Live long and prosper', ['May the Force be with you', 'To infinity and beyond', 'Resistance is futile']],
  // Minecraft
  ['Minecraft', 'Which hostile mob hisses before it explodes?', 'Creeper', ['Zombie', 'Skeleton', 'Enderman']],
  ['Minecraft', 'What item do you use to tame a wolf?', 'Bone', ['Raw beef', 'Wheat', 'Fish']],
  ['Minecraft', 'What is the minimum pickaxe needed to mine diamond ore?', 'Iron pickaxe', ['Stone pickaxe', 'Gold pickaxe', 'Wooden pickaxe']],
  ['Minecraft', 'In which dimension do you fight the Ender Dragon?', 'The End', ['The Nether', 'The Overworld', 'The Aether']],
  ['Minecraft', 'Which item helps you locate a stronghold?', 'Eye of Ender', ['Compass', 'Ender Pearl', 'Map']],
  ['Minecraft', 'Besides glass and obsidian, what do you need to craft a beacon?', 'Nether Star', ['Diamond', 'Dragon Egg', 'Heart of the Sea']],
  ['Minecraft', 'What is the maximum stack size for most items?', '64', ['32', '99', '128']],
  ['Minecraft', 'What do you use to repair Elytra on an anvil?', 'Phantom Membrane', ['Leather', 'Feathers', 'String']],
  ['Minecraft', 'Which mob drops blaze rods?', 'Blaze', ['Ghast', 'Wither Skeleton', 'Magma Cube']],
  ['Minecraft', 'Which block do you need to brew potions?', 'Brewing Stand', ['Cauldron', 'Enchanting Table', 'Furnace']],
  ['Minecraft', 'A netherite ingot is crafted from 4 netherite scraps and 4…', 'Gold ingots', ['Iron ingots', 'Diamonds', 'Emeralds']],
  ['Minecraft', 'How long is a full Minecraft day-night cycle in real time?', '20 minutes', ['10 minutes', '1 hour', '24 minutes']],
  ['Minecraft', 'What is the minimum number of obsidian blocks for a Nether portal frame?', '10', ['14', '8', '12']],
];
const QUESTIONS = 15;
const DRAIN = 4.2; // oxygen per second

export default class WormholeTrivia {
  constructor(root, ctx) {
    this.root = root; this.ctx = ctx;
    this.oxygen = 100; this.score = 0; this.streak = 0; this.index = 0; this.correct = 0;
    this.paused = true; this.timers = [];
    const pool = [...BANK].sort(() => Math.random() - 0.5).slice(0, QUESTIONS);
    this.questions = pool.map(([cat, q, a, wrong]) => ({ cat, q, a, options: [a, ...wrong].sort(() => Math.random() - 0.5) }));

    root.innerHTML = `
      <div class="trivia">
        <div class="oxygen">
          <div class="flex justify-between text-xs mb-1.5"><span class="font-display tracking-widest text-neon-cyan">O₂ SUPPLY</span><span data-o2>100%</span></div>
          <div class="oxygen-track"><div class="oxygen-fill" data-o2bar style="width:100%"></div></div>
        </div>
        <div class="q-card" data-card>
          <p class="font-display text-xs tracking-[0.3em] text-neon-purple">WORMHOLE TRIVIA</p>
          <h3 class="text-xl font-bold mt-2">Answer before your oxygen runs out</h3>
          <ul class="text-sm text-slate-300 mt-3 space-y-1">
            <li>• ${QUESTIONS} questions on astronomy, sci-fi and Minecraft</li>
            <li>• Correct answers refill oxygen (+18%) and score more when fast</li>
            <li>• Wrong answers vent oxygen (−15%). Streaks multiply points!</li>
            <li>• Use keys 1–4 or tap an answer</li>
          </ul>
          <button type="button" class="btn-neon mt-5" data-begin>Enter the wormhole</button>
        </div>
      </div>`;
    this.card = root.querySelector('[data-card]');
    this.o2 = root.querySelector('[data-o2]');
    this.o2bar = root.querySelector('[data-o2bar]');
    root.querySelector('[data-begin]').addEventListener('click', () => this.next());
    this.onKey = (e) => {
      const n = Number(e.key);
      if (n >= 1 && n <= 4) this.root.querySelectorAll('[data-opt]')[n - 1]?.click();
    };
    window.addEventListener('keydown', this.onKey);
    this.last = performance.now();
    this.raf = requestAnimationFrame((t) => this.loop(t));
  }

  loop(now) {
    this.raf = requestAnimationFrame((t) => this.loop(t));
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (this.paused || this.done) return;
    this.oxygen -= DRAIN * dt * (1 + this.index * 0.04);
    this.qTime += dt;
    this.renderO2();
    if (this.oxygen <= 0) this.finish(false);
  }

  renderO2() {
    const o = Math.max(0, this.oxygen);
    this.o2.textContent = `${Math.ceil(o)}%`;
    this.o2bar.style.width = `${o}%`;
    this.o2bar.classList.toggle('low', o < 25);
  }

  next() {
    if (this.index >= this.questions.length) return this.finish(true);
    const q = this.questions[this.index];
    this.qTime = 0;
    this.card.innerHTML = `
      <div class="flex justify-between items-center text-xs text-slate-400">
        <span class="game-tag" style="--card-accent:${q.cat === 'Minecraft' ? '#4ade80' : q.cat === 'Sci-Fi' ? '#f472b6' : '#22d3ee'}">${q.cat}</span>
        <span>Question ${this.index + 1} / ${this.questions.length}${this.streak >= 2 ? ` · 🔥 Streak ${this.streak}` : ''}</span>
      </div>
      <h3 class="text-lg sm:text-xl font-bold mt-3 leading-snug"></h3>
      <div class="grid sm:grid-cols-2 gap-2.5 mt-4">
        ${q.options.map((o, i) => `<button type="button" class="answer" data-opt="${i}"><kbd>${i + 1}</kbd><span></span></button>`).join('')}
      </div>`;
    this.card.querySelector('h3').textContent = q.q;
    this.card.querySelectorAll('[data-opt]').forEach((b, i) => {
      b.querySelector('span').textContent = q.options[i];
      b.addEventListener('click', () => this.answer(i));
    });
    this.paused = false;
  }

  answer(i) {
    if (this.paused || this.done) return;
    this.paused = true;
    const q = this.questions[this.index];
    const buttons = [...this.card.querySelectorAll('[data-opt]')];
    buttons.forEach((b) => { b.disabled = true; });
    const right = q.options[i] === q.a;
    buttons[q.options.indexOf(q.a)].classList.add('right');
    if (right) {
      this.streak++; this.correct++;
      const speed = Math.max(0, Math.round(60 - this.qTime * 8));
      const pts = Math.round((100 + speed) * (1 + Math.min(this.streak - 1, 4) * 0.25));
      this.score += pts;
      this.oxygen = Math.min(100, this.oxygen + 18);
      this.ctx.audio.pickup();
      this.ctx.setScore(this.score);
    } else {
      buttons[i].classList.add('wrong');
      this.streak = 0;
      this.oxygen -= 15;
      this.ctx.audio.error();
    }
    this.renderO2();
    this.ctx.setInfo(`${this.correct} correct`);
    this.index++;
    this.timers.push(setTimeout(() => {
      if (this.oxygen <= 0) this.finish(false); else this.next();
    }, right ? 750 : 1300));
  }

  finish(survived) {
    if (this.done) return;
    this.done = true;
    this.paused = true;
    const bonus = survived ? Math.round(Math.max(0, this.oxygen) * 5) : 0;
    this.score += bonus;
    this.ctx.setScore(this.score);
    this.ctx.gameOver(this.score, {
      won: survived,
      title: survived ? 'You made it through!' : 'Out of oxygen',
      message: `${this.correct} / ${this.questions.length} correct${bonus ? ` · +${bonus} oxygen bonus` : ''}`,
    });
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKey);
    this.timers.forEach(clearTimeout);
    this.root.innerHTML = '';
  }
}
