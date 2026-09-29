"use strict";
const E = EdgeEngine,
  $ = (id) => document.getElementById(id),
  canvas = $("board"),
  ctx = canvas.getContext("2d");
const difficulties = ["KOLAY", "ORTA", "ZOR"],
  descriptions = [
    "Tek gözcü. Düşünmek için bolca alan.",
    "İki gözcü. Her hamlede biri hareket eder.",
    "İki hızlı gözcü. Değişen enerji kareleri.",
  ];
let difficulty = 0,
  level = EDGE_LEVELS[0],
  state = E.initial(level),
  mode = "home",
  moves = 0,
  hints = 3,
  hintCell = -1,
  hintUntil = 0,
  trail = [],
  animation = null,
  particles = [],
  frame = 0,
  lastTime = 0,
  hover = -1;
let saved = { completed: {}, current: [0, 0, 0], muted: false, volume: 0.45 };
try {
  saved = { ...saved, ...JSON.parse(localStorage.getItem("edge-v1") || "{}") };
} catch {}
saved.current = Array.from({ length: 3 }, (_, i) =>
  Number.isInteger(saved.current?.[i]) &&
  saved.current[i] >= 0 &&
  saved.current[i] < 12
    ? saved.current[i]
    : 0,
);
saved.completed =
  saved.completed && typeof saved.completed === "object" ? saved.completed : {};
saved.volume = Number.isFinite(saved.volume)
  ? Math.max(0, Math.min(1, saved.volume))
  : 0.45;
saved.muted = !!saved.muted;
function persist() {
  try {
    localStorage.setItem("edge-v1", JSON.stringify(saved));
  } catch {}
}
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
let audioCtx,
  master,
  lastNote = 0;
function initAudio() {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      master = audioCtx.createGain();
      master.gain.value = saved.muted ? 0 : saved.volume;
      master.connect(audioCtx.destination);
    }
    if (audioCtx.state === "suspended") audioCtx.resume();
  } catch {}
}
function tone(freq, duration = 0.2, type = "sine", vol = 0.2, delay = 0) {
  if (!audioCtx || saved.muted) return;
  let at = audioCtx.currentTime + delay,
    o = audioCtx.createOscillator(),
    g = audioCtx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(vol, at + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  o.connect(g);
  g.connect(master);
  o.start(at);
  o.stop(at + duration + 0.03);
}
function sfx(kind) {
  if (kind === "step") {
    tone(330 + (moves % 4) * 55, 0.17, "sine", 0.16);
    tone(880, 0.09, "sine", 0.025, 0.015);
  } else if (kind === "win") {
    [392, 493.88, 587.33, 783.99].forEach((f, i) =>
      tone(f, 0.65, "sine", 0.12, i * 0.12),
    );
  } else if (kind === "lose") {
    tone(164.8, 0.45, "triangle", 0.1);
    tone(130.8, 0.6, "sine", 0.14, 0.15);
  } else if (kind === "hint") {
    tone(659, 0.4, "sine", 0.1);
    tone(988, 0.45, "sine", 0.08, 0.12);
  } else tone(440, 0.12, "sine", 0.06);
}
function syncSound() {
  $("sound").textContent = saved.muted ? "♫̸" : "♪";
  $("sound").setAttribute("aria-label", saved.muted ? "Sesi aç" : "Sesi kapat");
  if (master)
    master.gain.setTargetAtTime(
      saved.muted ? 0 : saved.volume,
      audioCtx.currentTime,
      0.03,
    );
}
syncSound();
$("sound").onclick = () => {
  initAudio();
  saved.muted = !saved.muted;
  syncSound();
  persist();
  if (!saved.muted) sfx("hint");
};
function selectDifficulty(d) {
  difficulty = d;
  document
    .querySelectorAll("[data-diff]")
    .forEach((b) => b.classList.toggle("selected", +b.dataset.diff === d));
  level = EDGE_LEVELS[d * 12 + saved.current[d]];
  state = E.initial(level);
  trail = [];
  animation = null;
  hintCell = -1;
  particles = [];
  $("levelsOpen").lastElementChild.textContent =
    String(saved.current[d] + 1).padStart(2, "0") + " — 12";
}
document.querySelectorAll("[data-diff]").forEach(
  (b) =>
    (b.onclick = () => {
      sfx("tap");
      selectDifficulty(+b.dataset.diff);
    }),
);
function home() {
  hideModal();
  mode = "home";
  document.body.classList.remove("playing");
  $("homeControls").hidden = false;
  $("playControls").hidden = true;
  $("gamebar").hidden = true;
  $("eyebrow").hidden = true;
  selectDifficulty(difficulty);
}
$("home").onclick = home;
function start(index = saved.current[difficulty]) {
  initAudio();
  hideModal();
  level = EDGE_LEVELS[difficulty * 12 + index];
  saved.current[difficulty] = index;
  persist();
  state = E.initial(level);
  mode = "play";
  moves = 0;
  hints = difficulty === 0 ? 5 : 3;
  hintCell = -1;
  trail = [];
  animation = null;
  particles = [];
  document.body.classList.add("playing");
  $("homeControls").hidden = true;
  $("playControls").hidden = false;
  $("gamebar").hidden = false;
  $("eyebrow").hidden = false;
  $("eyebrow").textContent =
    difficulties[difficulty] +
    " · " +
    String(index + 1).padStart(2, "0") +
    " / 12";
  $("par").textContent = level.par;
  updateHud();
  $("status").textContent = "";
  sfx("tap");
}
$("play").onclick = () => start();
$("restart").onclick = () => start(level.index);
$("levelsOpen").onclick = showLevels;
$("levelBack").onclick = showLevels;
function updateHud() {
  $("moves").textContent = moves;
  $("hints").textContent = hints;
}
function move(p) {
  if (mode !== "play" || !$("modal").hidden || animation) return;
  let next = E.transition(level, state, p);
  if (!next) {
    $("status").textContent = "Boş bir komşu kare seç.";
    return;
  }
  initAudio();
  moves++;
  hintCell = -1;
  trail.push(state.p);
  if (trail.length > 10) trail.shift();
  let old = state;
  state = next.dead
    ? { p, e: next.e || state.e.slice(), t: (state.t + 1) % 2 }
    : next;
  animation = {
    old,
    next: state,
    start: performance.now(),
    duration: reduced ? 50 : 260,
    done: () => {
      if (next.dead) finish(false, next.reason);
      else if (next.won) finish(true);
      else {
        $("status").textContent =
          difficulty === 2
            ? state.t === 0
              ? "Enerji kareleri bir sonraki hamlede tehlikeli."
              : "Enerji kareleri bir sonraki hamlede güvenli."
            : "";
      }
    },
  };
  updateHud();
  sfx("step");
}
$("hint").onclick = () => {
  if (mode !== "play" || animation) return;
  if (hints <= 0) {
    $("status").textContent = "İpuçların bitti.";
    return;
  }
  let path = E.solve(level, state);
  if (!path) {
    $("status").textContent = "Çıkış yok. Yeniden dene.";
    return;
  }
  hints--;
  hintCell = path[0];
  hintUntil = performance.now() + 4500;
  updateHud();
  $("status").textContent = "";
  initAudio();
  sfx("hint");
};
let previousFocus;
function showModal(html) {
  previousFocus = document.activeElement;
  $("modalBody").innerHTML = html;
  $("modal").hidden = false;
  $("closeModal").focus();
}
function hideModal() {
  $("modal").hidden = true;
  if (previousFocus && previousFocus.isConnected) previousFocus.focus();
}
$("closeModal").onclick = () => {
  if (mode === "win" || mode === "lose") home();
  else hideModal();
};
$("modal").addEventListener("click", (e) => {
  if (e.target === $("modal") && mode !== "win" && mode !== "lose") hideModal();
});
function showLevels() {
  showModal(
    '<div class="modal-kicker">' +
      difficulties[difficulty] +
      ' · 12 BÖLÜM</div><h2 id="modalTitle">Bölümler</h2><div class="level-grid">' +
      EDGE_LEVELS.filter((l) => l.difficulty === difficulty)
        .map(
          (l) =>
            '<button class="' +
            (l.index === saved.current[difficulty] ? "current" : "") +
            '" data-level="' +
            l.index +
            '">' +
            String(l.index + 1).padStart(2, "0") +
            "<small>" +
            (saved.completed[l.id]
              ? "★".repeat(saved.completed[l.id].stars)
              : l.par + " hamle") +
            "</small></button>",
        )
        .join("") +
      "</div>",
  );
  document
    .querySelectorAll("[data-level]")
    .forEach((b) => (b.onclick = () => start(+b.dataset.level)));
}
$("help").onclick = () =>
  showModal(
    '<div class="modal-kicker">EDGE / NASIL OYNANIR</div><h2 id="modalTitle">Işığa giden yol.</h2><ul class="rules"><li><b>01</b><span>Beyaz küre sensin. Komşu kareye dokun, kaydır veya yön tuşlarını kullan. Çapraz hareket yok.</span></li><li><b>02</b><span>Turkuaz halkaya ulaş. Koyu bloklardan geçemezsin. Noktalar gidebileceğin kareleri gösterir.</span></li><li><b>03</b><span>Turuncu gözcüler hamlelerinle sana yaklaşır. Parlayan gözcü bir sonraki hamlede hareket eder.</span></li><li><b>04</b><span>Zorda enerji kareleri dönüşümlü açılıp kapanır. Işıklı kare bir sonraki hamlede söner; sönük kare etkinleşir.</span></li><li><b>05</b><span>Süre sınırı yok. En kısa yolla bitirerek üç yıldız kazan. İpucu güvenli bir sonraki adımı gösterir.</span></li></ul><button class="primary" id="understood">ANLADIM</button>',
  );
$("modalBody").addEventListener("click", (e) => {
  if (e.target.id === "understood") hideModal();
});
$("pause").onclick = () => {
  if (mode !== "play" || animation) return;
  showModal(
    '<h2 id="modalTitle">Duraklatıldı</h2><label class="audio-row">Ses seviyesi <input id="volume" aria-label="Ses seviyesi" type="range" min="0" max="1" step="0.05" value="' +
      saved.volume +
      '"></label><button class="primary" id="resume">DEVAM ET</button><button class="secondary" id="menu">Ana menü</button>',
  );
  $("resume").onclick = hideModal;
  $("menu").onclick = home;
  $("volume").oninput = (e) => {
    saved.volume = +e.target.value;
    syncSound();
    persist();
  };
};
function finish(win, reason) {
  mode = win ? "win" : "lose";
  sfx(win ? "win" : "lose");
  if (navigator.vibrate) navigator.vibrate(win ? [20, 30, 20] : 40);
  let stars = moves === level.par ? 3 : moves <= level.par + 4 ? 2 : 1;
  if (win) {
    let prev = saved.completed[level.id];
    if (!prev || moves < prev.moves)
      saved.completed[level.id] = { moves, stars };
    if (level.index < 11) saved.current[difficulty] = level.index + 1;
    persist();
    burst(level.goal);
  }
  setTimeout(
    () => {
      if (mode !== (win ? "win" : "lose")) return;
      showModal(
        '<div class="modal-kicker">' +
          (win ? "ÇIKIŞA ULAŞTIN" : "YENİ BİR YOL DENE") +
          '</div><div class="result-icon">' +
          (win ? "◎" : "◇") +
          '</div><h2 id="modalTitle">' +
          (win ? "Tamamlandı" : "Yakalandın") +
          "</h2>" +
          (win
            ? '<div class="stars" aria-label="' +
              stars +
              ' yıldız">' +
              "★".repeat(stars) +
              '<span style="opacity:.2">' +
              "★".repeat(3 - stars) +
              '</span></div><div class="result-stats"><span><b>' +
              moves +
              "</b>HAMLE</span><span><b>" +
              level.par +
              "</b>EN KISA</span></div>"
            : "<p>" + reason + "</p>") +
          '<button class="primary" id="resultPrimary">' +
          (win
            ? level.index < 11
              ? "SONRAKİ BÖLÜM"
              : "BÖLÜMLERİ GÖR"
            : "TEKRAR DENE") +
          '</button><button class="secondary" id="resultHome">Ana menü</button>',
      );
      $("resultPrimary").onclick = () =>
        win
          ? level.index < 11
            ? start(level.index + 1)
            : showLevels()
          : start(level.index);
      $("resultHome").onclick = home;
    },
    win ? 650 : 280,
  );
}
let pointerStart;
canvas.addEventListener("pointerdown", (e) => {
  pointerStart = { x: e.clientX, y: e.clientY };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener("pointerup", (e) => {
  if (!pointerStart) return;
  let dx = e.clientX - pointerStart.x,
    dy = e.clientY - pointerStart.y;
  pointerStart = null;
  if (mode !== "play") return;
  if (Math.hypot(dx, dy) > 25) {
    let [x, y] = E.xy(state.p);
    if (Math.abs(dx) > Math.abs(dy)) x += Math.sign(dx);
    else y += Math.sign(dy);
    if (x >= 0 && x < 7 && y >= 0 && y < 7) move(y * 7 + x);
  } else {
    let p = cellAt(e.clientX, e.clientY);
    if (p >= 0) move(p);
  }
});
canvas.addEventListener("pointercancel", () => {
  pointerStart = null;
});
canvas.addEventListener("lostpointercapture", () => {
  pointerStart = null;
});
canvas.addEventListener(
  "pointermove",
  (e) => (hover = cellAt(e.clientX, e.clientY)),
);
canvas.addEventListener("pointerleave", () => (hover = -1));
document.addEventListener("keydown", (e) => {
  if (!$("modal").hidden) {
    if (e.key === "Escape" && mode !== "win" && mode !== "lose") hideModal();
    if (e.key === "Tab") {
      let buttons = [...$("modal").querySelectorAll("button,input")],
        first = buttons[0],
        last = buttons.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    return;
  }
  let key = e.key.toLowerCase(),
    d = {
      arrowup: [0, -1],
      w: [0, -1],
      arrowright: [1, 0],
      d: [1, 0],
      arrowdown: [0, 1],
      s: [0, 1],
      arrowleft: [-1, 0],
      a: [-1, 0],
    }[key];
  if (d && mode === "play") {
    e.preventDefault();
    let [x, y] = E.xy(state.p);
    x += d[0];
    y += d[1];
    if (x >= 0 && x < 7 && y >= 0 && y < 7) move(y * 7 + x);
  }
  if (key === "escape" && mode === "play") $("pause").click();
});
document.addEventListener("visibilitychange", () => {
  if (audioCtx) {
    if (document.hidden) audioCtx.suspend();
    else if (!saved.muted) audioCtx.resume();
  }
});
// Perspective is used only for rendering. Hit testing maps to the same projected tile geometry.
let W = 480,
  H = 410;
function boardGeometry() {
  const size = Math.min(W * 0.96, H * 0.92);
  return { size, top: (H - size) / 2, depth: 0.94 };
}
function project(x, y, z = 0) {
  let g = boardGeometry(),
    width = g.size * (0.97 + (0.03 * y) / 7);
  return {
    x: W / 2 + (x / 7 - 0.5) * width,
    y: g.top + (y * g.size * g.depth) / 7 - z,
  };
}
function poly(points, fill, stroke) {
  ctx.beginPath();
  points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }
}
function cellPoly(x, y, z = 0, inset = 0.018) {
  return [
    project(x + inset, y + inset, z),
    project(x + 1 - inset, y + inset, z),
    project(x + 1 - inset, y + 1 - inset, z),
    project(x + inset, y + 1 - inset, z),
  ];
}
function cellAt(clientX, clientY) {
  let r = canvas.getBoundingClientRect(),
    x = ((clientX - r.left) * W) / r.width,
    y = ((clientY - r.top) * H) / r.height,
    g = boardGeometry(),
    gy = (y - g.top) / ((g.size * g.depth) / 7);
  if (gy < 0 || gy >= 7) return -1;
  let width = g.size * (0.97 + (0.03 * gy) / 7),
    gx = ((x - W / 2) / width + 0.5) * 7;
  return gx >= 0 && gx < 7 ? Math.floor(gy) * 7 + Math.floor(gx) : -1;
}
function center(p, z = 0) {
  let [x, y] = Array.isArray(p) ? p : E.xy(p);
  return project(x + 0.5, y + 0.5, z);
}
function circle(x, y, r, color) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}
function ellipse(x, y, rx, ry, color) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}
function burst(p) {
  let c = center(p);
  for (let i = 0; i < 45; i++)
    particles.push({
      x: c.x,
      y: c.y,
      vx: (Math.random() - 0.5) * 3,
      vy: -Math.random() * 3 - 1,
      life: 1,
    });
}
function draw(time) {
  requestAnimationFrame(draw);
  let dt = Math.min(32, time - lastTime || 16);
  lastTime = time;
  let rect = canvas.getBoundingClientRect(),
    dpr = Math.min(devicePixelRatio || 1, 2);
  W = rect.width;
  H = rect.height;
  if (
    canvas.width !== Math.round(W * dpr) ||
    canvas.height !== Math.round(H * dpr)
  ) {
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  frame = time / 1000;
  let breath = reduced ? 0 : Math.sin(frame * 1.7),
    unit = boardGeometry().size / 8;
  const glow = ctx.createRadialGradient(
    W * 0.5,
    H * 0.58,
    5,
    W * 0.5,
    H * 0.58,
    W * 0.46,
  );
  glow.addColorStop(0, "#388e7030");
  glow.addColorStop(1, "#14383200");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  ellipse(W / 2, H * 0.87, W * 0.43, H * 0.06, "#00000055");
  let a = project(0, 0),
    b = project(7, 0),
    c = project(7, 7),
    d = project(0, 7);
  poly([a, b, c, d], "#172e34", "#547774");
  poly(
    [d, c, { x: c.x, y: c.y + 13 }, { x: d.x, y: d.y + 13 }],
    "#101f25",
    "#304849",
  );
  let valid = E.adjacent(state.p).filter((p) => !level.walls.includes(p));
  for (let y = 0; y < 7; y++)
    for (let x = 0; x < 7; x++) {
      let p = y * 7 + x;
      let color = (x + y) % 2 ? "#244047" : "#28474b";
      if (trail.includes(p)) color = "#304f50";
      if (p === hover && valid.includes(p) && mode === "play")
        color = "#416860";
      poly(cellPoly(x, y), color, "#162f36");
      let cc = center(p);
      if (level.pulses.includes(p)) {
        poly(
          cellPoly(x, y, 0, 0.12),
          state.t === 1 ? "#985b4855" : "#76665520",
        );
        ctx.strokeStyle = state.t === 1 ? "#eaaa80" : "#8a80705a";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(
          cc.x - unit * 0.17,
          cc.y - unit * 0.1,
          unit * 0.34,
          unit * 0.2,
        );
      }
      if (trail.includes(p))
        ellipse(cc.x, cc.y, unit * 0.07, unit * 0.05, "#759a9140");
    }
  // Exit ring and softly animated beam.
  let goal = center(level.goal),
    beam = ctx.createLinearGradient(
      goal.x,
      goal.y - unit * 0.8,
      goal.x,
      goal.y,
    );
  beam.addColorStop(0, "#a3ffcc00");
  beam.addColorStop(1, "#a3ffcc25");
  poly(
    [
      { x: goal.x - unit * 0.15, y: goal.y - unit * 0.8 },
      { x: goal.x + unit * 0.15, y: goal.y - unit * 0.8 },
      { x: goal.x + unit * 0.3, y: goal.y },
      { x: goal.x - unit * 0.3, y: goal.y },
    ],
    beam,
  );
  ctx.save();
  ctx.shadowBlur = 18;
  ctx.shadowColor = "#a6f9d5";
  ctx.strokeStyle = "#a6f9d5";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(
    goal.x,
    goal.y,
    unit * 0.25 + breath,
    unit * 0.22,
    0,
    0,
    Math.PI * 2,
  );
  ctx.stroke();
  ctx.restore();
  ellipse(goal.x, goal.y, unit * 0.1, unit * 0.09, "#baffda");
  if (mode === "play") {
    for (let p of valid) {
      let cp = center(p);
      if (p === level.goal) continue;
      ellipse(
        cp.x,
        cp.y,
        unit * 0.065,
        unit * 0.048,
        state.e.includes(p) ? "#f7b18d80" : "#d4f3e99a",
      );
    }
    if (hintCell >= 0 && time < hintUntil) {
      let [x, y] = E.xy(hintCell);
      poly(cellPoly(x, y, 0, 0.07), "#b3ffda44", "#b3ffda");
      let p = center(hintCell);
      circle(p.x, p.y, unit * 0.09, "#c4ffe4");
    } else hintCell = -1;
  }
  let t = animation
      ? Math.min(1, (time - animation.start) / animation.duration)
      : 1,
    tween = 1 - Math.pow(1 - t, 3);
  function interp(p, old) {
    if (!animation) return E.xy(p);
    let a = E.xy(old),
      b = E.xy(p);
    return [a[0] + (b[0] - a[0]) * tween, a[1] + (b[1] - a[1]) * tween];
  }
  let items = level.walls.map((p) => ({ type: "block", pos: E.xy(p) }));
  state.e.forEach((p, i) =>
    items.push({
      type: "enemy",
      pos: interp(p, animation ? animation.old.e[i] : p),
      i,
    }),
  );
  items.push({
    type: "player",
    pos: interp(state.p, animation ? animation.old.p : state.p),
  });
  items.sort((a, b) => a.pos[1] - b.pos[1]);
  for (let item of items) {
    let [x, y] = item.pos,
      cp = project(x + 0.5, y + 0.5),
      height = unit * 0.16;
    if (item.type === "block") {
      let bottom = cellPoly(x, y, 0, 0.11),
        top = cellPoly(x, y, height, 0.11);
      ellipse(cp.x + 3, cp.y + 6, unit * 0.46, unit * 0.23, "#0004");
      poly([top[1], top[2], bottom[2], bottom[1]], "#19292d", "#3c5154");
      poly([top[2], top[3], bottom[3], bottom[2]], "#23363b", "#3c5154");
      poly(top, "#475d60", "#718782");
      poly(cellPoly(x, y, height + 1, 0.17), "#4e6567");
    } else if (item.type === "enemy") {
      let moving = level.period === 1 || state.t === item.i % 2;
      ellipse(cp.x, cp.y + 3, unit * 0.23, unit * 0.14, "#06141888");
      let cy = cp.y - unit * 0.17,
        r = unit * 0.22;
      poly(
        [
          { x: cp.x, y: cy - r },
          { x: cp.x + r, y: cy },
          { x: cp.x, y: cy + r * 0.58 },
          { x: cp.x - r, y: cy },
        ],
        "#eb936e",
      );
      poly(
        [
          { x: cp.x, y: cy - r },
          { x: cp.x + r, y: cy },
          { x: cp.x, y: cy + r * 0.58 },
        ],
        "#b75d4d",
      );
      poly(
        [
          { x: cp.x, y: cy - r },
          { x: cp.x, y: cy + r * 0.58 },
          { x: cp.x - r, y: cy },
        ],
        "#ffb98b",
      );
      if (moving) {
        ctx.strokeStyle = "#f4b092";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.ellipse(cp.x, cp.y + 1, r * 1.25, r * 0.55, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        circle(cp.x, cy + 2, 2, "#743f3c");
      }
    } else {
      let jump = animation ? Math.sin(t * Math.PI) * unit * 0.12 : 0,
        cy = cp.y - unit * 0.18 - jump,
        r = unit * 0.19;
      ellipse(cp.x, cp.y + 4, r * 1.4, r * 0.55, "#091e2388");
      ctx.save();
      ctx.shadowColor = "#b6ffdf";
      ctx.shadowBlur = 14;
      let grad = ctx.createRadialGradient(
        cp.x - r * 0.35,
        cy - r * 0.4,
        1,
        cp.x,
        cy,
        r,
      );
      grad.addColorStop(0, "#ffffff");
      grad.addColorStop(0.6, "#eafff3");
      grad.addColorStop(1, "#72bca5");
      circle(cp.x, cy, r, grad);
      ctx.restore();
      ctx.strokeStyle = "#d1ffe6aa";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(cp.x, cp.y + 2, r * 1.25, r * 0.55, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  particles = particles.filter((p) => p.life > 0);
  for (let p of particles) {
    p.x += (p.vx * dt) / 16;
    p.y += (p.vy * dt) / 16;
    p.vy += 0.035;
    p.life -= dt / 1200;
    ctx.globalAlpha = Math.max(0, p.life);
    circle(p.x, p.y, 2, "#b4ffd9");
  }
  ctx.globalAlpha = 1;
  if (animation && t >= 1) {
    let done = animation.done;
    animation = null;
    done();
  }
  if (
    audioCtx &&
    mode === "play" &&
    $("modal").hidden &&
    !document.hidden &&
    time - lastNote > 5500
  ) {
    lastNote = time;
    [196, 246.94, 293.66].forEach((f, i) =>
      tone(f, 2.4, "sine", 0.012, i * 0.22),
    );
  }
}
selectDifficulty(0);
requestAnimationFrame(draw);
