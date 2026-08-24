"use strict";

const ACTION = { BASKET: "basket", REMOVE: "remove" };

const FILL = { CLEAN: "clean", INFLATE: "inflate" };

const DIRT = {
  maxLevel: 3,
  repsByLevel: { 1: 3, 2: 5, 3: 7 },
  level3MinScore: 700,
};

function allowedMaxDirt() {
  return state.score >= DIRT.level3MinScore ? DIRT.maxLevel : DIRT.maxLevel - 1;
}

const IMG_BASE = "assets/img/";
function skinUrl(name) {
  return 'url("' + IMG_BASE + name + '.png")';
}

const SKINS = {
  volleyball: ["volleyball_white", "volleyball_greenred"],
  wrong: [
    { img: "basketball", label: "농구공" },
    { img: "soccerball", label: "축구공" },
    { img: "mirrorball", label: "미러볼" },
  ],
  special: "specialball",
};
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

const BALL_TYPES = {
  normal: {
    key: "normal",
    label: "정상",
    commit: ACTION.BASKET,
    weight: 4,
  },
  dirty: {
    key: "dirty",
    label: "더러움",
    commit: ACTION.BASKET,
    process: FILL.CLEAN,
    weight: 3,
  },
  deflated: {
    key: "deflated",
    label: "바람빠짐",
    commit: ACTION.BASKET,
    process: FILL.INFLATE,
    reps: 10,
    weight: 3,
  },
  wrong: {
    key: "wrong",
    label: "제거대상",
    commit: ACTION.REMOVE,
    weight: 3,
  },
};

const CONFIG = {
  gameTime: 60,
  maxBelt: 5,
  spawnEvery: 700,
  minSpawn: 300,
  score: { basket: 10, remove: 8 },
  penalty: { score: 5, time: 1 },
  comboBonus: 2,

  variants: {
    special: {
      chance: 0.02,
      scoreMultiplier: 2,
      timeBonus: 10,
    },
    fake: {
      chance: 0.1,
      minScore: 50,
      cleanBonus: 4,
    },
  },
};

const state = {
  running: false,
  timeLeft: CONFIG.gameTime,
  score: 0,
  combo: 0,
  basket: 0,
  success: 0,
  maxCombo: 0,
  fail: 0,
  failStreak: 0,
  balls: [],
  nextId: 1,
  lastTick: 0,
  spawnTimer: 0,
  timeAcc: 0,
};

const el = {
  belt: document.getElementById("belt"),
  score: document.getElementById("score"),
  combo: document.getElementById("combo"),
  time: document.getElementById("time"),
  overlay: document.getElementById("overlay"),
  overlayTitle: document.getElementById("overlay-title"),
  overlayDesc: document.getElementById("overlay-desc"),
  startBtn: document.getElementById("start-btn"),
  helpBtn: document.getElementById("help-btn"),
  helpOverlay: document.getElementById("help-overlay"),
  helpCloseBtn: document.getElementById("help-close-btn"),
  centerFigure: document.getElementById("center-figure"),
  comboBig: document.getElementById("combo-big"),
  comboBigNum: document.getElementById("combo-big-num"),
  finalScore: document.getElementById("final-score"),
  statSuccess: document.getElementById("stat-success"),
  statFail: document.getElementById("stat-fail"),
  statCombo: document.getElementById("stat-combo"),
};

const FIGURE_IMG = {
  default: "assets/img/default.png",
  success: "assets/img/good.png",
  fail: "assets/img/bad.png",
  sad: "assets/img/sad.png",
  mad: "assets/img/mad.png",
};
let figureRevertTimer = null;

function showFeedback(type) {
  const fig = el.centerFigure;
  fig.src = FIGURE_IMG[type] || FIGURE_IMG.fail;
  fig.classList.remove("react");
  void fig.offsetWidth;
  fig.classList.add("react");
  clearTimeout(figureRevertTimer);
  figureRevertTimer = setTimeout(() => {
    fig.src = FIGURE_IMG.default;
    fig.classList.remove("react");
  }, 700);
}

function weightedPick() {
  const types = Object.values(BALL_TYPES);
  const total = types.reduce((s, t) => s + t.weight, 0);
  let r = Math.random() * total;
  for (const t of types) {
    r -= t.weight;
    if (r <= 0) return t;
  }
  return types[0];
}

function activeBall() {
  return state.balls[0] || null;
}

function rollVariant() {
  const v = CONFIG.variants;
  if (state.score >= DIRT.level3MinScore && Math.random() < v.special.chance) return "special";
  if (state.score >= v.fake.minScore && Math.random() < v.fake.chance) return "fake";
  return null;
}

function applyDirt(ball, node, startLevel) {
  ball.startLevel = startLevel;
  ball.repsByLevel = DIRT.repsByLevel;
  ball.process = FILL.CLEAN;
  ball.ready = false;
  let total = 0;
  for (let l = 1; l <= startLevel; l++) total += DIRT.repsByLevel[l];
  ball.totalNeeded = total;

  const overlay = document.createElement("div");
  overlay.className = "ball-overlay dirt-level-" + startLevel;
  node.appendChild(overlay);
  ball.overlayEl = overlay;
}

function spawnBall() {
  if (state.balls.length >= CONFIG.maxBelt) return;

  const variant = rollVariant();
  let def;
  if (variant === "special") def = BALL_TYPES.dirty;
  else if (variant === "fake") def = BALL_TYPES.wrong;
  else def = weightedPick();

  const ball = {
    id: state.nextId++,
    type: def.key,
    commit: def.commit,
    process: def.process || null,
    progress: 0,
    totalNeeded: def.reps || 0,
    ready: !def.process,
    lastFillKey: null,
    el: null,
    gaugeEl: null,
    overlayEl: null,
    towelEl: null,
    pumpEl: null,
    startLevel: 0,
    repsByLevel: null,
    fake: false,
    special: false,
  };

  const node = document.createElement("div");
  node.className = "ball " + def.key;
  node.dataset.id = String(ball.id);

  if (def.key === "wrong") {
    node.style.backgroundImage = skinUrl(pick(SKINS.wrong).img);
  } else {
    node.style.backgroundImage = skinUrl(pick(SKINS.volleyball));
  }

  const dirtCap = allowedMaxDirt();
  if (variant === "special") {
    applyDirt(ball, node, DIRT.maxLevel);
    ball.special = true;
    node.classList.add("special");
    node.style.backgroundImage = skinUrl(SKINS.special);
  } else if (variant === "fake") {
    applyDirt(ball, node, 1 + Math.floor(Math.random() * dirtCap));
    ball.fake = true;
  } else if (def.key === "dirty") {
    applyDirt(ball, node, 1 + Math.floor(Math.random() * dirtCap));
  }

  if (ball.process) {
    const gauge = document.createElement("div");
    gauge.className = "ball-gauge";
    const fill = document.createElement("div");
    fill.className = "ball-gauge-fill";
    gauge.appendChild(fill);
    node.appendChild(gauge);
    ball.gaugeEl = fill;
  }

  ball.el = node;
  state.balls.push(ball);
  el.belt.appendChild(node);
  refreshActive();
}

function currentDirtLevel(ball) {
  let remaining = ball.progress;
  for (let lvl = ball.startLevel; lvl >= 1; lvl--) {
    const need = ball.repsByLevel[lvl];
    if (remaining < need) return lvl;
    remaining -= need;
  }
  return 0;
}

function updateDirtVisual(ball) {
  const lvl = currentDirtLevel(ball);
  if (ball.overlayEl) {
    ball.overlayEl.className =
      "ball-overlay" + (lvl > 0 ? " dirt-level-" + lvl : " dirt-clean");
  }
}

function refreshActive() {
  state.balls.forEach((b, i) => {
    b.el.classList.toggle("active", i === 0);
  });
}

function markReady(ball) {
  ball.ready = true;
  ball.el.classList.add("ready", "filled");
  if (ball.special && !localStorage.getItem(SPECIAL_GUIDE_KEY)) {
    localStorage.setItem(SPECIAL_GUIDE_KEY, "1");
    showSpecialGuide();
  }
}

function removeBall(ball, cls) {
  ball.el.classList.remove("active", "deflated");
  if (ball.bounceAnim) { ball.bounceAnim.cancel(); ball.bounceAnim = null; }
  ball.el.classList.add(cls);
  const node = ball.el;
  setTimeout(() => node.remove(), 200);
  state.balls = state.balls.filter((b) => b !== ball);
  refreshActive();
}

function succeed(ball, gained, into) {
  state.combo += 1;
  state.maxCombo = Math.max(state.maxCombo, state.combo);
  state.success += 1;
  state.failStreak = 0;
  const bonus = state.combo * CONFIG.comboBonus;
  state.score += gained + bonus;

  if (into === "basket") {
    state.basket += 1;
    removeBall(ball, "leaving");
  } else {
    removeBall(ball, "leaving-down");
  }
  flash(el.score, "flash-good");
  showFeedback("success");
  updateHUD();
  if (state.combo >= 2) bump(el.comboBigNum); // 콤보 숫자 통통 튀는 연출
}

function fail(ball, direction, feedbackType) {
  state.combo = 0;
  state.fail += 1;
  state.failStreak += 1;
  state.score = Math.max(0, state.score - CONFIG.penalty.score);
  state.timeLeft = Math.max(0, state.timeLeft - CONFIG.penalty.time);
  flash(el.score, "flash-bad");
  flash(el.time, "flash-bad");
  if (ball) removeBall(ball, direction === "up" ? "fail-up" : "fail-down");
  let fb = feedbackType || "fail";
  if (state.failStreak >= 10) {
    fb = "mad";
    state.failStreak = 0;
  }
  showFeedback(fb);
  updateHUD();
}

function handleAction(kind, keyForFill) {
  if (!state.running) return;
  const ball = activeBall();
  if (!ball) return;

  if (kind === "up") {
    if (ball.commit === ACTION.BASKET && ball.ready) {
      if (ball.special) {
        const sp = CONFIG.variants.special;
        state.timeLeft = Math.min(CONFIG.gameTime, state.timeLeft + sp.timeBonus);
        flash(el.time, "flash-good");
        succeed(ball, CONFIG.score.basket * sp.scoreMultiplier, "basket");
      } else {
        succeed(ball, CONFIG.score.basket, "basket");
      }
    } else {
      const unprocessedBall = ball.commit === ACTION.BASKET && !ball.ready;
      fail(ball, "up", unprocessedBall ? "sad" : "fail");
    }
  } else if (kind === "down") {
    if (ball.commit === ACTION.REMOVE) {
      const bonus = ball.fake && ball.ready ? CONFIG.variants.fake.cleanBonus : 0;
      succeed(ball, CONFIG.score.remove + bonus, "trash");
    } else {
      fail(ball, "down");
    }
  } else if (kind === "fill") {
    showTowel(ball, keyForFill);
    if (ball.process === FILL.CLEAN && !ball.ready) {
      if (ball.lastFillKey && ball.lastFillKey !== keyForFill) addProgress(ball);
      ball.lastFillKey = keyForFill;
    }
  } else if (kind === "inflate") {
    showPump(ball);
    if (ball.process === FILL.INFLATE && !ball.ready) addProgress(ball);
  }
}

function showTowel(ball, dir) {
  let t = ball.towelEl;
  if (!t) {
    t = document.createElement("div");
    t.className = "towel";
    ball.el.appendChild(t);
    ball.towelEl = t;
  }
  t.classList.remove("swipe-left", "swipe-right");
  void t.offsetWidth;
  t.classList.add(dir === "left" ? "swipe-left" : "swipe-right");
}

function showPump(ball) {
  let p = ball.pumpEl;
  if (!p) {
    p = document.createElement("div");
    p.className = "pump";
    ball.el.appendChild(p);
    ball.pumpEl = p;
  }
  p.classList.remove("show");
  void p.offsetWidth;
  p.classList.add("show");

  if (ball.bounceAnim) ball.bounceAnim.cancel();
  ball.bounceAnim = ball.el.animate(
    [
      { transform: "scale(1)" },
      { transform: "scale(1.13)" },
      { transform: "scale(1)" },
    ],
    { duration: 220, easing: "ease-out" }
  );
}

function addProgress(ball) {
  ball.progress += 1;
  state.score += 1;
  const ratio = Math.min(1, ball.progress / ball.totalNeeded);
  if (ball.gaugeEl) ball.gaugeEl.style.width = ratio * 100 + "%";
  if (ball.overlayEl) updateDirtVisual(ball);
  if (ball.progress >= ball.totalNeeded) markReady(ball);
  updateHUD();
}

function updateHUD() {
  el.score.textContent = String(state.score);
  el.combo.textContent = String(state.combo);
  el.time.textContent = String(Math.ceil(state.timeLeft));
  el.time.classList.toggle("warn", state.timeLeft <= 10);
  // 캐릭터 라인 오른쪽 큰 콤보 숫자 (2 이상일 때만 표시)
  el.comboBigNum.textContent = String(state.combo);
  el.comboBig.classList.toggle("show", state.combo >= 2);
}

function bump(node) {
  node.classList.remove("pop");
  void node.offsetWidth;
  node.classList.add("pop");
}
function flash(node, cls) {
  node.classList.remove(cls);
  void node.offsetWidth;
  node.classList.add(cls);
}

function loop(ts) {
  if (!state.running) return;
  if (!state.lastTick) state.lastTick = ts;
  const dt = ts - state.lastTick;
  state.lastTick = ts;

  state.timeLeft -= dt / 1000;
  if (state.timeLeft <= 0) {
    state.timeLeft = 0;
    updateHUD();
    return endGame();
  }

  state.spawnTimer += dt;
  const elapsed = CONFIG.gameTime - state.timeLeft;
  const interval = Math.max(
    CONFIG.minSpawn,
    CONFIG.spawnEvery - elapsed * 8
  );
  if (state.spawnTimer >= interval) {
    state.spawnTimer = 0;
    spawnBall();
  }

  updateHUD();
  requestAnimationFrame(loop);
}

function startGame() {
  state.running = true;
  state.timeLeft = CONFIG.gameTime;
  state.score = 0;
  state.combo = 0;
  state.basket = 0;
  state.success = 0;
  state.maxCombo = 0;
  state.fail = 0;
  state.failStreak = 0;
  state.nextId = 1;
  state.lastTick = 0;
  state.spawnTimer = 0;
  state.balls.forEach((b) => b.el.remove());
  state.balls = [];

  clearTimeout(figureRevertTimer);
  el.centerFigure.src = FIGURE_IMG.default;
  el.centerFigure.classList.remove("react");

  el.overlay.classList.remove("gameover");
  el.overlay.classList.add("hidden");
  updateHUD();

  spawnBall();
  spawnBall();

  requestAnimationFrame(loop);
}

function endGame() {
  state.running = false;
  el.overlayTitle.textContent = "おつかれさまッス!";
  el.finalScore.textContent = String(state.score);
  el.statSuccess.textContent = String(state.success);
  el.statFail.textContent = String(state.fail);
  el.statCombo.textContent = String(state.maxCombo);
  el.startBtn.textContent = "다시 하기";
  el.overlay.classList.add("gameover");
  el.overlay.classList.remove("hidden");
}

window.addEventListener("keydown", (e) => {
  switch (e.key) {
    case "ArrowUp":
      e.preventDefault();
      handleAction("up");
      break;
    case "ArrowDown":
      e.preventDefault();
      handleAction("down");
      break;
    case "ArrowLeft":
      e.preventDefault();
      handleAction("fill", "left");
      break;
    case "ArrowRight":
      e.preventDefault();
      handleAction("fill", "right");
      break;
    case " ":
    case "Spacebar":
      e.preventDefault();
      handleAction("inflate");
      break;
  }
});

el.startBtn.addEventListener("click", startGame);

function pauseGame() {
  state.running = false;
}
function resumeGame() {
  if (state.timeLeft <= 0) return;
  state.running = true;
  state.lastTick = 0;
  requestAnimationFrame(loop);
}

const SPECIAL_GUIDE_KEY = "specialCleanedGuideShown";
el.specialOverlay = document.getElementById("special-overlay");
el.specialCloseBtn = document.getElementById("special-close-btn");

function showSpecialGuide() {
  pauseGame();
  el.specialOverlay.classList.remove("hidden");
}
function closeSpecialGuide() {
  el.specialOverlay.classList.add("hidden");
  resumeGame();
}
el.specialCloseBtn.addEventListener("click", closeSpecialGuide);

function openHelp() { el.helpOverlay.classList.remove("hidden"); }
function closeHelp() { el.helpOverlay.classList.add("hidden"); }
el.helpBtn.addEventListener("click", openHelp);
el.helpCloseBtn.addEventListener("click", closeHelp);

el.helpOverlay.addEventListener("click", (e) => {
  if (e.target === el.helpOverlay) closeHelp();
});

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeHelp();
});

const bgm = document.getElementById("bgm");
const bgmToggle = document.getElementById("bgm-toggle");
const bgmVolume = document.getElementById("bgm-volume");

let userPausedBgm = false;

bgm.volume = Number(bgmVolume.value) / 100;

function syncBgmIcon() {
  bgmToggle.textContent = bgm.paused ? "▶" : "⏸";
}

function playBgm() {
  const p = bgm.play();
  if (p && typeof p.catch === "function") p.catch(() => { });
}

bgmToggle.addEventListener("click", () => {
  if (bgm.paused) {
    userPausedBgm = false;
    playBgm();
  } else {
    userPausedBgm = true;
    bgm.pause();
  }
});

bgmVolume.addEventListener("input", () => {
  bgm.volume = Number(bgmVolume.value) / 100;
});

bgm.addEventListener("play", syncBgmIcon);
bgm.addEventListener("pause", syncBgmIcon);

function tryAutostartBgm(e) {
  if (e && e.target && e.target.closest && e.target.closest("#bgm-control")) return;
  if (!userPausedBgm && bgm.paused) playBgm();
}
window.addEventListener("pointerdown", tryAutostartBgm);
window.addEventListener("keydown", tryAutostartBgm);

syncBgmIcon();