// Little stars drifting in the background of the kids' site.
// They wander on their own, and when you move the mouse (or drag a finger)
// the stars near it get pushed along in the direction you moved.

const EMOJIS = ["⭐", "✨", "🌟"];
const PUSH_RADIUS = 180; // px around the pointer that feel the "wind"
const PUSH_STRENGTH = 0.08; // how much of the pointer's speed is passed on
const MAX_SPEED = 6; // px per frame, so a fast swipe doesn't fling them away
const DRIFT = 0.25; // normal wandering speed

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const canvas = document.createElement("canvas");
canvas.className = "stars";
canvas.setAttribute("aria-hidden", "true");
// Pin it behind everything right here, so it stays a background even if the
// stylesheet is an old cached copy without the .stars rule.
Object.assign(canvas.style, {
  position: "fixed",
  inset: "0",
  width: "100%",
  height: "100%",
  zIndex: "0",
  pointerEvents: "none",
});
document.body.prepend(canvas);
const ctx = canvas.getContext("2d");

let width = 0;
let height = 0;
let stars = [];

const pointer = { x: -9999, y: -9999, vx: 0, vy: 0, lastMove: 0 };

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function makeStar() {
  const angle = rand(0, Math.PI * 2);
  return {
    x: rand(0, width),
    y: rand(0, height),
    vx: Math.cos(angle) * DRIFT,
    vy: Math.sin(angle) * DRIFT,
    size: rand(9, 16),
    emoji: EMOJIS[Math.floor(Math.random() * EMOJIS.length)],
    alpha: rand(0.3, 0.55), // faint, so they never compete with the stickers
    twinkle: rand(0, Math.PI * 2),
    spin: rand(-0.01, 0.01),
    angle: rand(0, Math.PI * 2),
  };
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // roughly one star per 28,000 px² of screen: ~16 on a phone, ~50 on a laptop
  const wanted = Math.max(16, Math.min(60, Math.round((width * height) / 28000)));
  while (stars.length < wanted) stars.push(makeStar());
  stars.length = wanted;
  for (const s of stars) {
    s.x = Math.min(s.x, width);
    s.y = Math.min(s.y, height);
  }
  if (reduceMotion) draw();
}

function onPointerMove(e) {
  const now = performance.now();
  if (pointer.lastMove) {
    const dt = Math.max(16, now - pointer.lastMove);
    // pointer speed in px per 16ms frame
    pointer.vx = ((e.clientX - pointer.x) / dt) * 16;
    pointer.vy = ((e.clientY - pointer.y) / dt) * 16;
  }
  pointer.x = e.clientX;
  pointer.y = e.clientY;
  pointer.lastMove = now;
}

function onPointerLeave() {
  pointer.x = pointer.y = -9999;
  pointer.vx = pointer.vy = 0;
  pointer.lastMove = 0;
}

function update() {
  // the "wind" from the pointer fades out quickly once you stop moving
  pointer.vx *= 0.85;
  pointer.vy *= 0.85;

  for (const s of stars) {
    // push from the pointer, stronger the closer the star is
    const dx = s.x - pointer.x;
    const dy = s.y - pointer.y;
    const dist = Math.hypot(dx, dy);
    if (dist < PUSH_RADIUS) {
      const falloff = 1 - dist / PUSH_RADIUS;
      s.vx += pointer.vx * PUSH_STRENGTH * falloff;
      s.vy += pointer.vy * PUSH_STRENGTH * falloff;
    }

    // a tiny random nudge so each star wanders on its own
    s.vx += rand(-0.03, 0.03);
    s.vy += rand(-0.03, 0.03);

    // ease back toward a gentle drift speed after being pushed
    const speed = Math.hypot(s.vx, s.vy);
    if (speed > MAX_SPEED) {
      s.vx = (s.vx / speed) * MAX_SPEED;
      s.vy = (s.vy / speed) * MAX_SPEED;
    } else if (speed > DRIFT) {
      s.vx *= 0.97;
      s.vy *= 0.97;
    } else if (speed < DRIFT * 0.5) {
      s.vx *= 1.05;
      s.vy *= 1.05;
    }

    s.x += s.vx;
    s.y += s.vy;
    s.angle += s.spin + s.vx * 0.01;
    s.twinkle += 0.03;

    // wrap around the edges
    const m = s.size;
    if (s.x < -m) s.x = width + m;
    if (s.x > width + m) s.x = -m;
    if (s.y < -m) s.y = height + m;
    if (s.y > height + m) s.y = -m;
  }
}

function draw() {
  ctx.clearRect(0, 0, width, height);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const s of stars) {
    ctx.save();
    ctx.globalAlpha = reduceMotion ? s.alpha : s.alpha * (0.75 + 0.25 * Math.sin(s.twinkle));
    ctx.translate(s.x, s.y);
    ctx.rotate(s.angle);
    ctx.font = `${s.size}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
    ctx.fillText(s.emoji, 0, 0);
    ctx.restore();
  }
}

function loop() {
  update();
  draw();
  requestAnimationFrame(loop);
}

window.addEventListener("resize", resize);
resize();

if (!reduceMotion) {
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("pointerdown", onPointerMove, { passive: true });
  document.addEventListener("pointerleave", onPointerLeave);
  window.addEventListener("blur", onPointerLeave);
  requestAnimationFrame(loop);
}
