(() => {
  // -----------------------
  // Конфигурация размеров
  // -----------------------
  const GAME_WIDTH = 960;
  const GAME_HEIGHT = 720;
  const TILE = 40; // базовый тайл
  const MAP_W = Math.floor(GAME_WIDTH / TILE); // 32
  const MAP_H = Math.floor(GAME_HEIGHT / TILE); // 18
  const SCALE = 0.5;
  // -----------------------
  // Цвета (24-bit hex)
  // -----------------------
  const COLORS = {
    bg: 0x080812,
    steel: 0xb4b6c8,
    brick_dark: 0x96401e,
    brick_light: 0xc8642a,
    water: 0x2878c8,
    grass: 0x14902a,
    base_yellow: 0xc8a11e,
    base_red: 0x8b0f0f,
    track: 0x2a2a2a,
    hull_green: 0x1e8f2d,
    hull_red: 0xc83a3a,
    star_gold: 0xffdf66,
    white: 0xffffff,
    fuel: 0xFF9900, // Цвет топливных бочек
    fuel_dark: 0xCC6600 // Темный цвет для деталей
  };

  // -----------------------
  // Простая WebAudio синтезатор
  // -----------------------
  class AudioSynth {
    constructor() {
      try {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) {
        this.ctx = null;
      }
    }
    beep(freq = 440, time = 0.08, type = 'sine', gain = 0.2) {
      if (!this.ctx) return;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.value = gain;
      o.connect(g);
      g.connect(this.ctx.destination);
      const now = this.ctx.currentTime;
      o.start(now);
      g.gain.exponentialRampToValueAtTime(0.001, now + time);
      o.stop(now + time + 0.02);
    }
    noise(time = 0.12, gainVal = 0.2) {
      if (!this.ctx) return;
      const bufferSize = Math.floor(this.ctx.sampleRate * time);
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;
      const g = this.ctx.createGain();
      g.gain.value = gainVal;
      noise.connect(g);
      g.connect(this.ctx.destination);
      const now = this.ctx.currentTime;
      noise.start(now);
      noise.stop(now + time);
    }
    burst(freqs = [600, 900, 1200], duration = 0.18, gain = 0.25) {
      if (!this.ctx) return;
      // quick sequence of short beeps
      let start = this.ctx.currentTime;
      const piece = duration / Math.max(1, freqs.length);
      freqs.forEach((f, i) => {
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = 'sine';
        o.frequency.value = f;
        g.gain.value = gain;
        o.connect(g);
        g.connect(this.ctx.destination);
        o.start(start + i * piece);
        g.gain.exponentialRampToValueAtTime(0.001, start + (i + 1) * piece);
        o.stop(start + (i + 1) * piece + 0.01);
      });
    }
    fuelPickup() {
      if (!this.ctx) return;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'sine';
      o.frequency.value = 660;
      g.gain.value = 0.2;
      o.connect(g);
      g.connect(this.ctx.destination);
      const now = this.ctx.currentTime;
      o.start(now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      o.stop(now + 0.17);
    }
  }
  const audio = new AudioSynth();

  // -----------------------
  // Map generation helpers
  // -----------------------
  function makeEmptyMap(w = MAP_W, h = MAP_H) {
    const g = [];
    for (let y = 0; y < h; y++) {
      g[y] = [];
      for (let x = 0; x < w; x++) g[y][x] = 0;
    }
    for (let x = 0; x < w; x++) { g[0][x] = 1; g[h - 1][x] = 1; }
    for (let y = 0; y < h; y++) { g[y][0] = 1; g[y][w - 1] = 1; }
    return g;
  }

  function generateRandomMap(w = MAP_W, h = MAP_H, baseX = null) {
    const grid = makeEmptyMap(w, h);
    if (baseX === null) baseX = Math.floor(w / 2);
    const baseY = h - 2;
    // clear base area
    for (let by = baseY - 1; by <= baseY + 1; by++) {
      for (let bx = baseX - 1; bx <= baseX + 1; bx++) {
        if (by >= 0 && by < h && bx >= 0 && bx < w) grid[by][bx] = 0;
      }
    }
    grid[baseY][baseX] = 9;
    // steels
    let sc = 12 + Math.floor(Math.random() * 12);
    while (sc--) {
      const rx = 1 + Math.floor(Math.random() * (w - 2));
      const ry = 1 + Math.floor(Math.random() * (h - 3));
      if (grid[ry][rx] === 0 && !(ry >= baseY - 2 && Math.abs(rx - baseX) <= 2)) grid[ry][rx] = 1;
    }
    // bricks
    let bc = 40 + Math.floor(Math.random() * 36);
    while (bc--) {
      const rx = 1 + Math.floor(Math.random() * (w - 2));
      const ry = 1 + Math.floor(Math.random() * (h - 3));
      if (grid[ry][rx] === 0) grid[ry][rx] = 2;
    }
    // water patches
    let wc = 8 + Math.floor(Math.random() * 12);
    while (wc--) {
      const rx = 1 + Math.floor(Math.random() * (w - 2));
      const ry = 1 + Math.floor(Math.random() * (h - 3));
      if (grid[ry][rx] === 0) {
        grid[ry][rx] = 3;
        for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) {
          if (Math.random() < 0.4) {
            const nx = rx + dx, ny = ry + dy;
            if (nx > 0 && nx < w - 1 && ny > 0 && ny < h - 2 && grid[ny][nx] === 0) grid[ny][nx] = 3;
          }
        }
      }
    }
    // grass clusters
    let gc = 12 + Math.floor(Math.random() * 16);
    while (gc--) {
      const rx = 1 + Math.floor(Math.random() * (w - 2));
      const ry = 1 + Math.floor(Math.random() * (h - 3));
      if (grid[ry][rx] === 0) {
        grid[ry][rx] = 4;
        for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) {
          if (Math.random() < 0.35) {
            const nx = rx + dx, ny = ry + dy;
            if (nx > 0 && nx < w - 1 && ny > 0 && ny < h - 2 && grid[ny][nx] === 0) grid[ny][nx] = 4;
          }
        }
      }
    }
    // ensure spawn top free
    const spawns = [[2, 1], [Math.floor(w / 2), 1], [w - 3, 1]];
    for (const s of spawns) grid[s[1]][s[0]] = 0;
    return grid;
  }

  // Генерация топливных бочек на карте
  function generateFuelCans(grid) {
    const fuelCans = [];
    const w = grid[0].length;
    const h = grid.length;
    
    // Определяем количество бочек (от 2 до 5)
    const canCount = 2 + Math.floor(Math.random() * 4);
    
    let placed = 0;
    let attempts = 0;
    const maxAttempts = 100;
    
    while (placed < canCount && attempts < maxAttempts) {
      attempts++;
      const rx = 1 + Math.floor(Math.random() * (w - 2));
      const ry = 1 + Math.floor(Math.random() * (h - 3));
      
      // Проверяем, можно ли разместить бочку здесь
      // Нельзя размещать в воде (3), бетоне (1), кирпичах (2), базе (9)
      if (grid[ry][rx] === 0 || grid[ry][rx] === 4) { // Можно на траве или пустой клетке
        // Проверяем, не слишком ли близко к другим бочкам
        let tooClose = false;
        for (const can of fuelCans) {
          if (Math.abs(can.x - rx) < 3 && Math.abs(can.y - ry) < 3) {
            tooClose = true;
            break;
          }
        }
        
        if (!tooClose) {
          fuelCans.push({ x: rx * TILE + TILE / 2, y: ry * TILE + TILE / 2, alive: true });
          placed++;
        }
      }
    }
    
    return fuelCans;
  }

  // -----------------------
  // Utility helpers
  // -----------------------
  function findBase(grid) {
    for (let y = 0; y < grid.length; y++) {
      for (let x = 0; x < grid[0].length; x++) if (grid[y][x] === 9) return { x, y };
    }
    return { x: Math.floor(MAP_W / 2), y: MAP_H - 2 };
  }

  // -----------------------
  // Phaser Scenes
  // -----------------------

  // ---------- MenuScene ----------
  class MenuScene extends Phaser.Scene {
    constructor() {
      super({ key: 'MenuScene' });
      this.menuIndex = 0;
      this.items = [];
    }
    preload() {
      // nothing to preload (no external assets)
    }
    create() {
      const centerX = this.cameras.main.centerX;
      const centerY = this.cameras.main.centerY;
      this.add.text(centerX, 72, 'Battle City — Финальная версия', { fontSize: '48px', color: '#f4dc88', fontFamily: 'Arial' }).setOrigin(0.5);
      this.menuIndex = 0;
      const startTxt = this.add.text(centerX, 240, 'Начать игру', { fontSize: '36px', color: '#fff' }).setOrigin(0.5);
      const exitTxt = this.add.text(centerX, 300, 'Выход', { fontSize: '36px', color: '#bbb' }).setOrigin(0.5);
      this.items = [startTxt, exitTxt];

      this.input.keyboard.on('keydown-UP', () => this.selectPrev());
      this.input.keyboard.on('keydown-W', () => this.selectPrev());
      this.input.keyboard.on('keydown-DOWN', () => this.selectNext());
      this.input.keyboard.on('keydown-S', () => this.selectNext());
      this.input.keyboard.on('keydown-ENTER', () => this.activate());
      this.input.keyboard.on('keydown-SPACE', () => this.activate());

      // small preview map drawn with graphics (decorative)
      const mini = generateRandomMap(8, 4);
      const px = centerX - 160, py = 380;
      const g = this.add.graphics();
      for (let y = 0; y < mini.length; y++) {
        for (let x = 0; x < mini[0].length; x++) {
          const t = mini[y][x];
          const rx = px + x * 32, ry = py + y * 32;
          if (t === 1) { g.fillStyle(COLORS.steel).fillRect(rx, ry, 32, 32); }
          else if (t === 2) { g.fillStyle(COLORS.brick_dark).fillRect(rx, ry, 32, 32); }
          else if (t === 3) { g.fillStyle(COLORS.water).fillRect(rx, ry, 32, 32); }
          else if (t === 4) { g.fillStyle(COLORS.grass).fillRect(rx, ry, 32, 32); }
          else if (t === 9) { g.fillStyle(COLORS.base_yellow).fillRect(rx + 6, ry + 8, 20, 20); }
          else g.fillStyle(0x0b0b0b).fillRect(rx, ry, 32, 32);
        }
      }

      this.add.text(centerX, GAME_HEIGHT - 70, 'WASD/Стрелки — навигация, ENTER/SPACE — подтвердить', { fontSize: '16px', color: '#bfc' }).setOrigin(0.5);
      this.updateMenuVisual();
    }

    selectPrev() {
      this.menuIndex = (this.menuIndex + this.items.length - 1) % this.items.length;
      this.updateMenuVisual();
      audio.beep(600, 0.06, 'sine', 0.12);
    }
    selectNext() {
      this.menuIndex = (this.menuIndex + 1) % this.items.length;
      this.updateMenuVisual();
      audio.beep(600, 0.06, 'sine', 0.12);
    }
    activate() {
      if (this.menuIndex === 0) {
        this.scene.start('GameScene');
      } else {
        // Пересылаем на главную страницу Вконтакте
        window.location.href = 'https://vk.com';
      }
      audio.beep(900, 0.06, 'sine', 0.12);
    }
    updateMenuVisual() {
      this.items.forEach((it, i) => it.setColor(i === this.menuIndex ? '#fff' : '#9a9a9a'));
    }
  }

  // ---------- GameScene ----------
  class GameScene extends Phaser.Scene {
    constructor() {
      super({ key: 'GameScene' });
      // game state fields initialized in init()
    }

    init() {
      this.map = generateRandomMap();
      this.base = findBase(this.map);
      this.player = null;
      this.enemies = [];
      this.bullets = [];
      this.powerups = [];
      this.fuelCans = [];
      this.explosions = [];
      this.flashes = [];
      this.currentWave = 1;
      this.currentLevel = 1;
      this.wavesPerLevel = 4;
      this.enemySpeedBase = 1.2;
      this.baseState = { shielded: false, timer: 0, duration: 15 * 60 };
    }

    preload() {
      // nothing to load (no PNG)
    }

    create() {
      // Генерируем топливные бочки
      this.fuelCans = generateFuelCans(this.map);
      
      // input
      this.cursors = this.input.keyboard.createCursorKeys();
      this.keyW = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
      this.keyA = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
      this.keyS = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S);
      this.keyD = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
      this.keySpace = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
      this.keyEsc = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);

      // render layer
      this.graph = this.add.graphics();

      // create player
      this.player = this.createPlayer(9, MAP_H - 2);

      // spawn first wave
      this.spawnWave(3);

      // UI text
      this.fpsText = this.add.text(12, GAME_HEIGHT - 36, '', { fontSize: '16px', color: '#fff' });
      this.uiScore = this.add.text(12, 8, '', { fontSize: '20px', color: '#eaeaea' });
      this.uiLevel = this.add.text(260, 8, '', { fontSize: '20px', color: '#ffd' });
      this.uiHint = this.add.text(12, GAME_HEIGHT - 28, 'WASD/Стрелки - движение  ПРОБЕЛ - стрельба  ESC - меню', { fontSize: '16px', color: '#bdbdbd' });
      this.uiFuelText = this.add.text(GAME_WIDTH - 200, 8, '', { fontSize: '20px', color: '#FF9900' });

      // container for hearts (we will remove & recreate content)
      this.uiLives = this.add.container();

      // Панель топлива
      this.fuelBarBg = this.add.graphics();
      this.fuelBar = this.add.graphics();

      // for smoother timings
      this.lastTick = 0;
    }

    createPlayer(cx, cy) {
      return {
        spawnX: cx, spawnY: cy,
        x: cx * TILE + TILE / 2, y: cy * TILE + TILE / 2,
        dir: 0, turretAngle: -90, speed: 3.2, size: 11,
        reload: 0, lives: 3, level: 1, score: 0, alive: true, invul: 0, trackPhase: 0,
        fuel: 100, // Полный бак топлива (100%)
        maxFuel: 100,
        fuelConsumption: 0.02 // Потребление топлива за кадр при движении
      };
    }

    spawnWave(n) {
      const spawns = [[2, 1], [Math.floor(MAP_W / 2), 1], [MAP_W - 3, 1]];
      Phaser.Utils.Array.Shuffle(spawns);
      for (let i = 0; i < n; i++) {
        const s = spawns[i % spawns.length];
        const speed = this.enemySpeedBase + 0.05 * (this.currentLevel - 1) + 0.08 * Math.floor((this.currentWave - 1) / 2);
        this.enemies.push(this.createEnemy(s[0], s[1], speed));
      }
    }

    createEnemy(cx, cy, speed = 1.6) {
      return {
        x: cx * TILE + TILE / 2,
        y: cy * TILE + TILE / 2,
        dir: Phaser.Math.Between(0, 3),
        speed,
        size: 10,
        moveTimer: Phaser.Math.Between(20, 80),
        reload: Phaser.Math.Between(40, 120),
        alive: true,
        trackPhase: 0
      };
    }

    createBullet(x, y, angleDeg, owner = 'player', speed = 8, level = 1) {
      this.bullets.push({ x, y, angle: Phaser.Math.DegToRad(angleDeg), owner, speed, range: 600, alive: true, size: 6, level });

      if (owner === 'player') audio.beep(900, 0.06, 'sine', 0.12); else audio.beep(300, 0.05, 'square', 0.09);
    }

    update(time, delta) {
      // pause->menu quick escape
      if (Phaser.Input.Keyboard.JustDown(this.keyEsc)) {
        this.scene.pause();
        this.scene.launch('MenuScene');
        return;
      }

      // input flags
      const keys = {
        up: this.keyW.isDown || this.cursors.up.isDown,
        down: this.keyS.isDown || this.cursors.down.isDown,
        left: this.keyA.isDown || this.cursors.left.isDown,
        right: this.keyD.isDown || this.cursors.right.isDown
      };

      // update world
      this.updatePlayer(keys);
      for (const e of this.enemies) if (e.alive) this.updateEnemy(e);
      for (let i = this.bullets.length - 1; i >= 0; i--) { const b = this.bullets[i]; this.updateBullet(b); if (!b.alive) this.bullets.splice(i, 1); }
      for (let i = this.powerups.length - 1; i >= 0; i--) { const p = this.powerups[i]; if (!p.update(this.player)) this.powerups.splice(i, 1); }
      
      // Обновление топливных бочек
      for (let i = this.fuelCans.length - 1; i >= 0; i--) {
        const can = this.fuelCans[i];
        if (can.alive && this.player.alive && 
            Phaser.Math.Distance.Between(this.player.x, this.player.y, can.x, can.y) < 28) {
          // Игрок подобрал бочку
          this.player.fuel = Math.min(this.player.maxFuel, this.player.fuel + this.player.maxFuel / 3);
          can.alive = false;
          audio.fuelPickup();
          this.flashes.push({ x: can.x, y: can.y, timer: 20 });
        }
      }
      
      // explode/flash cleanup
      this.explosions = this.explosions.filter(ex => { ex.timer--; return ex.timer > 0; });
      this.flashes = this.flashes.filter(f => { f.timer--; return f.timer > 0; });

      // base shield
      if (this.baseState && this.baseState.shielded) {
        this.baseState.timer--;
        if (this.baseState.timer <= 0) this.baseState.shielded = false;
      }

      // remove dead enemies and scoring
      let cleared = true;
      for (let i = this.enemies.length - 1; i >= 0; i--) {
        if (!this.enemies[i].alive) { this.player.score += 100; this.enemies.splice(i, 1); }
      }
      if (this.enemies.length > 0) cleared = false;

      // wave progression
      if (cleared) {
        this.currentWave++;
        if (this.currentWave > this.wavesPerLevel) {
          // next level transition
          this.currentWave = 1;
          this.currentLevel++;
          this.enemySpeedBase += 0.02;
          // regen map & reset arrays
          this.map = generateRandomMap();
          this.base = findBase(this.map);
          // Генерируем новые топливные бочки для нового уровня
          this.fuelCans = generateFuelCans(this.map);
          this.enemies.length = 0; this.bullets.length = 0; this.powerups.length = 0; this.explosions.length = 0; this.flashes.length = 0;
          // reposition player spawn bottom
          this.player.spawnX = 9; this.player.spawnY = MAP_H - 2;
          this.player.x = this.player.spawnX * TILE + TILE / 2; this.player.y = this.player.spawnY * TILE + TILE / 2;
          // Восстанавливаем топливо при переходе на новый уровень
          this.player.fuel = this.player.maxFuel;
          // small delay/visual can be added
        }
        const spawnCount = Math.min(8, 2 + this.currentLevel + this.currentWave);
        this.spawnWave(spawnCount);
      }

      // check game over - теперь также при нулевом топливе
      if (this.player.lives <= 0 || this.player.fuel <= 0) {
        // go to menu / game over
        this.scene.pause();
        this.scene.launch('MenuScene');
        alert('GAME OVER — База/Игрок погиб или закончилось топливо. Возвращение в меню.');
        this.scene.stop();
        return;
      }

      // render
      this.renderFrame();

      // HUD
      this.fpsText.setText('FPS: ' + Math.round(this.game.loop.actualFps));
      
      // Обновление UI топлива
      this.uiFuelText.setText(`Топливо: ${Math.floor(this.player.fuel)}%`);
      this.updateFuelBar();
    }

    updatePlayer(keys) {
      const p = this.player;
      if (!p.alive) return;
      
      // Потребление топлива только при движении
      let moved = false;
      let dx = 0, dy = 0;
      
      if (keys.up) { p.dir = 0; dy = -p.speed; moved = true; }
      else if (keys.down) { p.dir = 2; dy = p.speed; moved = true; }
      else if (keys.left) { p.dir = 3; dx = -p.speed; moved = true; }
      else if (keys.right) { p.dir = 1; dx = p.speed; moved = true; }

      if (moved && p.fuel > 0) {
        // Потребляем топливо при движении
        p.fuel = Math.max(0, p.fuel - p.fuelConsumption);
        
        const newx = p.x + dx, newy = p.y + dy;
        const left = Math.floor((newx - p.size / 2) / TILE);
        const right = Math.floor((newx + p.size / 2) / TILE);
        const top = Math.floor((newy - p.size / 2) / TILE);
        const bottom = Math.floor((newy + p.size / 2) / TILE);
        let blocked = false;
        for (let ty = top; ty <= bottom; ty++) {
          for (let tx = left; tx <= right; tx++) {
            if (ty < 0, tx < 0, ty >= MAP_H || tx >= MAP_W) { blocked = true; break; }
            const t = this.map[ty][tx];
            if ([1, 2, 3, 9].includes(t)) { blocked = true; break; } // water blocks too
          }
          if (blocked) break;
        }
        if (!blocked) { p.x = newx; p.y = newy; p.trackPhase = (p.trackPhase + 1) % 12; }
        else {
          // sliding attempt (try axis separation)
          if (dx && dy) {
            // try X only
            const tx1 = Math.floor((p.x + dx - p.size / 2) / TILE);
            const tx2 = Math.floor((p.x + dx + p.size / 2) / TILE);
            let blockedX = false;
            for (let ty = Math.floor((p.y - p.size / 2) / TILE); ty <= Math.floor((p.y + p.size / 2) / TILE); ty++) {
              if (this.map[ty] && [1, 2, 3, 9].includes(this.map[ty][tx1])) blockedX = true;
              if (this.map[ty] && [1, 2, 3, 9].includes(this.map[ty][tx2])) blockedX = true;
            }
            if (!blockedX) p.x += dx;
            else {
              const ty1 = Math.floor((p.y + dy - p.size / 2) / TILE);
              const ty2 = Math.floor((p.y + dy + p.size / 2) / TILE);
              let blockedY = false;
              for (let tx = Math.floor((p.x - p.size / 2) / TILE); tx <= Math.floor((p.x + p.size / 2) / TILE); tx++) {
                if (this.map[ty1] && [1, 2, 3, 9].includes(this.map[ty1][tx])) blockedY = true;
                if (this.map[ty2] && [1, 2, 3, 9].includes(this.map[ty2][tx])) blockedY = true;
              }
              if (!blockedY) p.y += dy;
            }
          }
        }
        // turret alignment to grid dir
        const tgt = { 0: -90, 1: 0, 2: 90, 3: 180 }[p.dir];
        const cur = p.turretAngle;
        let diff = ((tgt - cur + 180) % 360) - 180;
        p.turretAngle = (cur + diff * 0.4) % 360;
      }
      
      // Если топливо закончилось, танк не может двигаться
      if (p.fuel <= 0) {
        // Танк обездвижен
      }

      // reload
      if (p.reload > 0) p.reload--;
      if (p.invul > 0) p.invul--;

      // firing
      if (Phaser.Input.Keyboard.JustDown(this.keySpace)) {
        if (p.reload <= 0) {
          const ang = [-90, 0, 90, 180][p.dir];
          const spd = 9 + (p.level - 1) * 2;
          this.createBullet(p.x, p.y, ang, 'player', spd, p.level);
          p.reload = Math.max(8, 26 - 6 * (p.level - 1));
        }
      }
    }

    updateEnemy(e) {
      if (!e.alive) return;

      e.moveTimer--;
      if (e.moveTimer <= 0) {
        e.dir = Phaser.Math.Between(0, 3);
        e.moveTimer = Phaser.Math.Between(30, 90);
      }

      const tryMove = (dx, dy) => {
        const newx = e.x + dx;
        const newy = e.y + dy;

        const left = Math.floor((newx - e.size / 2) / TILE);
        const right = Math.floor((newx + e.size / 2) / TILE);
        const top = Math.floor((newy - e.size / 2) / TILE);
        const bottom = Math.floor((newy + e.size / 2) / TILE);

        // проверка карты
        for (let ty = top; ty <= bottom; ty++) {
          for (let tx = left; tx <= right; tx++) {
            if (ty < 0, tx < 0, ty >= MAP_H || tx >= MAP_W) return false;
            if ([1,2,3,9].includes(this.map[ty][tx])) return false;
          }
        }

        // проверка игрока
        const pd = this.player;
        if (pd.alive && Math.abs(pd.x - newx) < pd.size + e.size && Math.abs(pd.y - newy) < pd.size + e.size) return false;

        // проверка других врагов
        for (const other of this.enemies) {
          if (other === e || !other.alive) continue;
          if (Math.abs(other.x - newx) < other.size + e.size && Math.abs(other.y - newy) < other.size + e.size) return false;
        }

        // проверка пуль игрока
        for (const b of this.bullets) {
          if (b.alive && b.owner === 'player') {
            if (Math.abs(b.x - newx) < b.size + e.size && Math.abs(b.y - newy) < e.size + b.size) return false;
          }
        }

        // путь свободен
        e.x = newx;
        e.y = newy;
        return true;
      };

      // основные движения: вперед
      const dx = [0, e.speed, 0, -e.speed][e.dir];
      const dy = [-e.speed, 0, e.speed, 0][e.dir];
      let moved = tryMove(dx, dy);

      // если заблокировано, пробуем немного смещаться по оси X или Y
      if (!moved) {
        moved = tryMove(dx, 0) || tryMove(0, dy);
        if (!moved) {
          e.dir = Phaser.Math.Between(0, 3); // если всё ещё заблокировано — меняем направление
          e.moveTimer = Phaser.Math.Between(20, 60);
        }
      }

      // поворот башни
      const turretTargetAngle = [-90, 0, 90, 180][e.dir];
      const cur = e.turretAngle || 0;
      let diff = ((turretTargetAngle - cur + 180) % 360) - 180;
      e.turretAngle = (cur + diff * 0.4) % 360;

      // стрельба
      e.reload--;
      if (e.reload <= 0) {
        if (Math.random() < 0.5) {
          const ang = [-90, 0, 90, 180][e.dir];
          this.createBullet(e.x, e.y, ang, 'enemy', 5, 1);
          audio.beep(320, 0.06, 'square', 0.08);
        }
        e.reload = Phaser.Math.Between(40, 120);
      }
    }

    updateBullet(b) {
      b.x += Math.cos(b.angle) * b.speed;
      b.y += Math.sin(b.angle) * b.speed;
      b.range -= b.speed;
      if (b.range <= 0) { b.alive = false; return; }
      const tx = Math.floor(b.x / TILE), ty = Math.floor(b.y / TILE);
      if (tx < 0, ty < 0, tx >= MAP_W || ty >= MAP_H) { b.alive = false; return; }
      const tile = this.map[ty][tx];
      if (tile === 1) { b.alive = false; return; }
      if (tile === 2) {
        this.map[ty][tx] = 0;
        this.explosions.push({ x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2, timer: 12 });
        if (audio) audio.noise(0.12, 0.09);
        b.alive = false; return;
      }
      if (tile === 9) {
        if (!this.baseState) this.baseState = { shielded: false, timer: 0, duration: 12 * 60 };
        if (this.baseState.shielded) {
          this.explosions.push({ x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2, timer: 8 });
          b.alive = false;
          if (audio) audio.beep(600, 0.06, 'sine', 0.08);
          return;
        } else {
          // base destroyed -> game over
          this.scene.pause();
          this.scene.launch('MenuScene');
          alert('🦅 База уничтожена! Игра окончена');
          this.scene.stop();
          return;
        }
      }

      // collisions with tanks
      if (b.owner === 'player') {
        for (const e of this.enemies) {
          if (e.alive && Phaser.Math.Distance.Between(b.x, b.y, e.x, e.y) < e.size) {
            e.alive = false; b.alive = false;
            this.explosions.push({ x: e.x, y: e.y, timer: 18 });
            // spawn powerups with chance
            if (Math.random() < 0.28) this.powerups.push(new PUStar(this, e.x, e.y));
            if (Math.random() < 0.12) this.powerups.push(new PUShield(this, e.x, e.y));
            return;
          }
        }
      } else {
        const p = this.player;
        if (p.alive && Phaser.Math.Distance.Between(b.x, b.y, p.x, p.y) < p.size) {
          if (p.invul <= 0) this.playerTakeHit();
          b.alive = false;
          return;
        }
      }
    }

    playerTakeHit() {
      const p = this.player;
      if (p.invul > 0) return;
      if (p.level > 1) {
        p.level--; p.speed = Math.max(2.0, p.speed - 0.4);
        this.flashes.push({ x: p.x, y: p.y, timer: 12 });
        audio.beep(240, 0.12, 'sine', 0.12);
      } else {
        p.lives--; p.level = 1; p.speed = 3.2; p.alive = false;
        this.explosions.push({ x: p.x, y: p.y, timer: 22 });
        if (audio) audio.noise(0.18, 0.16);
        this.time.delayedCall(1500, () => { p.x = p.spawnX * TILE + TILE / 2; p.y = p.spawnY * TILE + TILE / 2; p.alive = true; p.invul = 60; }, [], this);
      }
    }

    updateFuelBar() {
      const p = this.player;
      const barWidth = 150;
      const barHeight = 16;
      const x = GAME_WIDTH - barWidth - 20;
      const y = 40;
      
      // Очищаем предыдущие бары
      this.fuelBarBg.clear();
      this.fuelBar.clear();
      
      // Фон бара
      this.fuelBarBg.fillStyle(0x333333, 1);
      this.fuelBarBg.fillRect(x, y, barWidth, barHeight);
      
      // Цвет бара в зависимости от уровня топлива
      let fuelColor;
      if (p.fuel > 50) fuelColor = 0x00FF00; // Зеленый
      else if (p.fuel > 20) fuelColor = 0xFFFF00; // Желтый
      else fuelColor = 0xFF0000; // Красный
      
      // Заполненная часть
      const fillWidth = (p.fuel / p.maxFuel) * barWidth;
      this.fuelBar.fillStyle(fuelColor, 1);
      this.fuelBar.fillRect(x, y, fillWidth, barHeight);
      
      // Обводка
      this.fuelBar.lineStyle(2, 0xFFFFFF, 1);
      this.fuelBar.strokeRect(x, y, barWidth, barHeight);
      
      // Если топливо на исходе, добавляем мигание
      if (p.fuel < 15 && Math.floor(this.time.now / 300) % 2 === 0) {
        this.fuelBar.fillStyle(0xFFFFFF, 0.5);
        this.fuelBar.fillRect(x, y, fillWidth, barHeight);
      }
    }

    renderFrame() {
      // clear
      this.graph.clear();

      // draw map base layer
      for (let y = 0; y < this.map.length; y++) {
        for (let x = 0; x < this.map[0].length; x++) {
          const t = this.map[y][x];
          const rx = x * TILE, ry = y * TILE;
          if (t === 1) { // steel
            this.graph.fillStyle(COLORS.steel, 1).fillRect(rx, ry, TILE, TILE);
            this.graph.lineStyle(1, 0xffffff, 0.35); this.graph.strokeRect(rx, ry, TILE, TILE);
          } else if (t === 2) { this.drawBrick(rx, ry); }
          else if (t === 3) { this.graph.fillStyle(COLORS.water, 1).fillRect(rx, ry, TILE, TILE); this.graph.fillStyle(0x50bfff, 0.5).fillCircle(rx + TILE / 3, ry + TILE / 3, 6); }
          else if (t === 4) { this.drawGrass(rx, ry); }
          else if (t === 9) { this.drawBase(rx, ry); }
          else { this.graph.fillStyle(0x0b0b0b, 1).fillRect(rx, ry, TILE, TILE); }
        }
      }

      // bullets
      for (const b of this.bullets) { this.graph.fillStyle(b.owner === 'player' ? 0xfff080 : 0xffffff, 1).fillCircle(b.x, b.y, b.size); }

      // enemies
      for (const e of this.enemies) if (e.alive) {
        const turretAngles = [-90, 0, 90, 180]; // 0=up,1=right,2=down,3=left
        this.drawTank(e.x, e.y, e.dir, turretAngles[e.dir], COLORS.hull_red, 1, e.trackPhase);
      }

      // player
      if (this.player.alive) {
        const pd = this.player;
        const flashOn = (pd.invul > 0 && Math.floor(this.time.now / 120) % 2 === 0);
        this.drawTank(pd.x, pd.y, pd.dir, pd.turretAngle, COLORS.hull_green, pd.level, pd.trackPhase, flashOn);
      }

      // powerups
      for (const p of this.powerups) p.draw(this.graph);
      
      // fuel cans
      for (const can of this.fuelCans) {
        if (can.alive) this.drawFuelCan(can.x, can.y);
      }

      // explosions
      for (const ex of this.explosions) if (ex.timer > 0) {
        this.graph.fillStyle(0xffd06f, 1).fillCircle(ex.x, ex.y, (18 - ex.timer));
        this.graph.fillStyle(0xff4f24, 1).fillCircle(ex.x, ex.y, Math.max(1, (8 - ex.timer / 2)));
      }

      // flashes
      for (const f of this.flashes) if (f.timer > 0) {
        const a = f.timer / 18;
        this.graph.fillStyle(0xffffff, a * 0.8).fillCircle(f.x, f.y, 80 * (1 - a) + 8);
      }

      // grass overlay (to partially hide)
      this.drawGrassOverlay();

      // UI update
      this.drawUI();
    }

    drawFuelCan(x, y) {
      const g = this.graph;
      // Основа бочки
      g.fillStyle(COLORS.fuel, 1).fillRect(x - 10, y - 16, 20, 32);
      
      // Ободки бочки
      g.lineStyle(3, COLORS.fuel_dark, 1);
      g.strokeRect(x - 10, y - 16, 20, 32);
      g.lineStyle(2, COLORS.fuel_dark, 1);
      g.lineBetween(x - 10, y - 10, x + 10, y - 10);
      g.lineBetween(x - 10, y + 10, x + 10, y + 10);
      
      // Этикетка
      g.fillStyle(0xFF0000, 1).fillRect(x - 8, y - 8, 16, 16);
      g.fillStyle(0xFFFFFF, 1).fillRect(x - 6, y - 6, 12, 12);
      
      // Буква "F" (Fuel)
      g.lineStyle(3, 0xFF0000, 1);
      g.lineBetween(x - 4, y - 4, x - 4, y + 4);
      g.lineBetween(x - 4, y - 4, x + 2, y - 4);
      g.lineBetween(x - 4, y, x, y);
      
      // Верхняя крышка
      g.fillStyle(COLORS.fuel_dark, 1).fillEllipse(x, y - 18, 12, 6);
      g.fillStyle(0x333333, 1).fillCircle(x, y - 18, 4);
    }

    drawBrick(rx, ry) {
      const small = TILE / 2;
      this.graph.fillStyle(COLORS.brick_dark, 1).fillRect(rx, ry, TILE, TILE);
      this.graph.fillStyle(COLORS.brick_light, 1).fillRect(rx + 4, ry + 4, TILE - 8, TILE - 8);
      this.graph.lineStyle(1, 0x77331a, 1); this.graph.strokeRect(rx, ry, TILE, TILE);
    }

    drawGrass(rx, ry) {
      this.graph.fillStyle(COLORS.grass, 1).fillRect(rx, ry, TILE, TILE);
      for (let i = rx; i < rx + TILE; i += 4) this.graph.lineStyle(1, 0x28b63a, 1).lineBetween(i, ry, i, ry + TILE);
    }

    drawBase(rx, ry) {
      if (!this.baseState) this.baseState = { shielded: false, timer: 0, duration: 12 * 60 };
      if (this.baseState.shielded) {
        this.graph.fillStyle(0xbebff2, 1).fillRect(rx, ry, TILE, TILE);
        this.graph.fillStyle(0x7878a8, 1).fillRect(rx + 8, ry + 8, TILE - 16, TILE - 16);
        this.graph.fillStyle(0x96c8ff, 0.18).fillCircle(rx + TILE / 2, ry + TILE / 2, TILE / 1.2);
      } else {
        this.graph.fillStyle(COLORS.base_yellow, 1).fillRect(rx + 8, ry + 10, TILE - 16, TILE - 16);
        this.graph.fillStyle(COLORS.base_red, 1).fillTriangle(rx + TILE / 2, ry + 6, rx + TILE - 6, ry + TILE - 12, rx + 6, ry + TILE - 12);
        this.graph.fillStyle(0x781010, 1).fillRect(rx + TILE / 2 - 6, ry + TILE / 2 - 2, 12, 12);
      }
    }

    drawGrassOverlay() {
      for (let y = 0; y < this.map.length; y++) for (let x = 0; x < this.map[0].length; x++) {
        if (this.map[y][x] === 4) {
          const rx = x * TILE, ry = y * TILE;
          this.graph.fillStyle(0x111111, 0.12).fillRect(rx, ry, TILE, TILE);
        }
      }
    }

    // drawTank: improved tread animation and turret vs body separation
    drawTank(cx, cy, dir, turretAngle, baseColor, level = 1, trackPhase = 0, flash = false) {
      // вычисляем тайл танка
      const tx = Math.floor(cx / TILE);
      const ty = Math.floor(cy / TILE);

      // прозрачность танка: кусты или флеш
      let alpha = 1;
      if (this.map[ty] && this.map[ty][tx] === 4) alpha = 0.05; // на кустах
      if (flash) alpha = 0.05; // инвул/flash

      // Если у игрока закончилось топливо, рисуем мигание
      if (this.player && this.player.fuel <= 0 && this.player.alive && Math.floor(this.time.now / 200) % 2 === 0) {
        alpha = 0.3;
      }

      // shadow (тень остаётся почти непрозрачной)
      this.graph.fillStyle(0x111111, 0.5).fillEllipse(cx, cy + 18*SCALE, 56*SCALE, 18*SCALE);

      // hull body
      const hull = (level === 1) ? baseColor : (level === 2 ? 0xE6C84D : 0xFF8C00);
      this.graph.fillStyle(hull, alpha).fillRect(cx - 26*SCALE, cy - 20*SCALE, 52*SCALE, 40*SCALE);
      this.graph.lineStyle(2, 0x000000, alpha).strokeRect(cx - 26*SCALE, cy - 20*SCALE, 52*SCALE, 40*SCALE);

      // side plates (track covers)
      this.graph.fillStyle(0x323232, alpha).fillRect(cx - 32*SCALE, cy - 20*SCALE, 6*SCALE, 40*SCALE);
      this.graph.fillStyle(0x323232, alpha).fillRect(cx + 26*SCALE, cy - 20*SCALE, 6*SCALE, 40*SCALE);

      // treads
      const treadColor = 0x2a2a2a, bolt = 0x606060;
      if (dir === 0 || dir === 2) {
        for (let i = -2; i <= 2; i++) {
          const oy = cy + i * 8 + (trackPhase % 3) - 1;
          this.graph.fillStyle(treadColor, alpha).fillRect(cx - 34*SCALE, oy - 4*SCALE, 8*SCALE, 8*SCALE);
          this.graph.fillStyle(treadColor, alpha).fillRect(cx + 26*SCALE, oy - 4*SCALE, 8*SCALE, 8*SCALE);
          this.graph.fillStyle(bolt, alpha).fillRect(cx - 30*SCALE, oy - 2*SCALE, 2*SCALE, 2*SCALE);
          this.graph.fillStyle(bolt, alpha).fillRect(cx + 30*SCALE, oy - 2*SCALE, 2*SCALE, 2*SCALE);
        }
      } else {
        for (let i = -2; i <= 2; i++) {
          const ox = cx + i * 8 + (trackPhase % 3) - 1;
          this.graph.fillStyle(treadColor, alpha).fillRect(ox - 4*SCALE, cy + 22*SCALE, 8*SCALE, 8*SCALE);
          this.graph.fillStyle(treadColor, alpha).fillRect(ox - 4*SCALE, cy - 30*SCALE, 8*SCALE, 8*SCALE);
          this.graph.fillStyle(bolt, alpha).fillRect(ox - 2*SCALE, cy + 24*SCALE, 2*SCALE, 2*SCALE);
          this.graph.fillStyle(bolt, alpha).fillRect(ox - 2*SCALE, cy - 28*SCALE, 2*SCALE, 2*SCALE);
        }
      }

      // turret
      this.graph.fillStyle(0x2a2a2a, alpha).fillCircle(cx, cy - 6*SCALE, 12*SCALE);
      this.graph.fillStyle(0x505050, alpha).fillCircle(cx, cy - 6*SCALE, 8*SCALE);

      // barrel
      const rad = Phaser.Math.DegToRad(turretAngle);
      const barrelLen = 26 + (level - 1) * 8 * SCALE;
      const bx = cx + Math.cos(rad) * barrelLen;
      const by = cy - 6*SCALE + Math.sin(rad) * barrelLen;
      const thickness = level === 1 ? 6 : level === 2 ? 8 : 10;
      this.graph.lineStyle(thickness*SCALE, 0x141414, alpha).lineBetween(cx, cy - 6*SCALE, bx, by);
      this.graph.fillStyle(0x0f0f0f, alpha).fillCircle(cx, cy - 6*SCALE, 4*SCALE);

      // hatch & details
      this.graph.lineStyle(1, 0x222222, alpha).lineBetween(cx - 10*SCALE, cy - 16*SCALE, cx + 10*SCALE, cy - 16*SCALE);
    }

    drawUI() {
      this.uiScore.setText('Счёт: ' + this.player.score + '   Волна: ' + this.currentWave + '   Уровень: ' + this.currentLevel);
      // hearts
      this.uiLives.removeAll(true);
      for (let i = 0; i < this.player.lives; i++) {
        const heart = this.add.graphics();
        const x = 12 + i * 36, y = 36;
        heart.fillStyle(0xdc2830, 1).fillCircle(x + 8, y + 8, 8);
        heart.fillStyle(0xdc2830, 1).fillCircle(x + 20, y + 8, 8);
        heart.fillStyle(0xdc2830, 1).fillTriangle(x, y + 14, x + 28, y + 14, x + 14, y + 28);
        this.uiLives.add(heart);
      }
      this.uiLevel.setText('Ур. танка: ' + this.player.level);
      // base shield indicator
      if (this.baseState && this.baseState.shielded) {
        const rem = Math.ceil(this.baseState.timer / 60);
        if (!this.uiShield) this.uiShield = this.add.text(GAME_WIDTH - 220, 8, '', { fontSize: '18px', color: '#9de' });
        this.uiShield.setText('Щит базы: ' + rem + 'с');
      } else {
        if (this.uiShield) { this.uiShield.destroy(); this.uiShield = null; }
      }
    }
  } // end GameScene class

  // -----------------------
  // PowerUps (constructors)
  // -----------------------
  function PUStar(scene, x, y) {
    this.scene = scene; this.x = x; this.y = y; this.timer = 500; this.angle = 0; this.pulse = 0;
    this.update = function (player) {
      this.angle = (this.angle + 8) % 360;
      this.pulse = (this.pulse + 0.2) % 4;
      this.timer--;
      if (player.alive && Phaser.Math.Distance.Between(player.x, player.y, this.x, this.y) < 28) {
        if (player.level < 3) { player.level++; player.speed += 0.4; if (audio) audio.burst([880, 1200, 1480], 0.18, 0.18); }
        else { player.lives++; if (audio) audio.beep(1500, 0.12, 'sine', 0.16); }
        scene.flashes.push({ x: player.x, y: player.y, timer: 20 });
        return false;
      }
      return this.timer > 0;
    };
    this.draw = function (graph) {
      const points = [];
      const r1 = 12 + Math.sin(this.pulse) * 2;
      const r2 = 4;
      for (let i = 0; i < 10; i++) {
        const a = Phaser.Math.DegToRad(i * 36 + this.angle);
        const r = (i % 2 === 0) ? r1 : r2;
        points.push({ x: this.x + Math.cos(a) * r, y: this.y + Math.sin(a) * r });
      }
      graph.fillStyle(COLORS.star_gold, 1).fillPoints(points, true);
      graph.lineStyle(2, 0xffb300, 1).strokePoints(points, true);
    };
  }

  function PUShield(scene, x, y) {
    this.scene = scene; this.x = x; this.y = y; this.timer = 200; this.angle = 0;
    this.update = function (player) {
      this.angle = (this.angle + 6) % 360;
      this.timer--;
      if (player.alive && Phaser.Math.Distance.Between(player.x, player.y, this.x, this.y) < 28) {
        if (!scene.baseState) scene.baseState = { shielded: false, timer: 0, duration: 12 * 60 };
        scene.baseState.shielded = true;
        scene.baseState.timer = scene.baseState.duration;
        scene.explosions.push({ x: scene.base.x * TILE + TILE / 2, y: scene.base.y * TILE + TILE / 2, timer: 10 });
        if (audio) audio.beep(1400, 0.12, 'triangle', 0.12);
        return false;
      }
      return this.timer > 0;
    };
    this.draw = function (graph) {
      const cx = this.x, cy = this.y;
      graph.fillStyle(0xffdc80, 1).fillTriangle(cx, cy - 8, cx + 12, cy + 6, cx - 12, cy + 6);
      graph.fillStyle(0xca9b32, 1).fillRect(cx - 6, cy + 2, 12, 8);
    };
  }

  // -----------------------
  // Phaser Game Boot
  // -----------------------
  const gameConfig = {
    type: Phaser.AUTO,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    parent: 'gameContainer',
    backgroundColor: '#080812',
    physics: { default: 'arcade', arcade: { debug: false } },
    scene: [MenuScene, GameScene]
  };

  const game = new Phaser.Game(gameConfig);

  // -----------------------
  // End of closure
  // -----------------------
})();