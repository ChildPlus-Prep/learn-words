// Little stars (and other things kids love) drifting in the background of the kids' site.
// They wander on their own, and when you move the mouse (or drag a finger)
// the ones near it get pushed along in the direction you moved.
//
// Speed notes:
// - Each emoji is drawn ONCE into a small image ("sprite"), and every frame just
//   copies those images. Drawing emoji text every frame is what made it slow.
// - Movement is based on real time, not frame count, so on a slow device the
//   emojis still move at the same speed instead of crawling.

// stars first (listed twice so they stay the most common), then other things kids love
const EMOJIS = [
  "⭐", "✨", "🌟", "⭐", "✨", "🌟",
  "🎈", "🦋", "🌸", "🐠", "🎀", "🍦", "🐞", "🐝", "⚽", "🧸",
];
const MIN_SIZE = 18; // px
const MAX_SIZE = 32; // px
const PUSH_RADIUS = 180; // px around the pointer that feel the "wind"
const PUSH_STRENGTH = 0.08; // how much of the pointer's speed is passed on
const MAX_SPEED = 6; // px per 60fps frame, so a fast swipe doesn't fling them away
const DRIFT = 0.6; // normal wandering speed, px per 60fps frame (~36 px a second)

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
let dpr = 1;
let stars = [];
let sprites = new Map(); // emoji -> pre-drawn image

const pointer = { x: -9999, y: -9999, vx: 0, vy: 0, lastMove: 0 };

function rand(min, max) {
  return min + Math.random() * (max - min);
}

// Draw each emoji once, at the biggest size we use, into its own little canvas.
function makeSprites() {
  sprites = new Map();
  const px = Math.ceil(MAX_SIZE * dpr);
  const box = Math.ceil(px * 1.4); // room for emoji that draw a bit outside their box
  for (const emoji of new Set(EMOJIS)) {
    const c = document.createElement("canvas");
    c.width = c.height = box;
    const g = c.getContext("2d");
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = `${px}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
    g.filter = "saturate(1.35) brightness(1.08)"; // extra-vivid colors (done once per emoji, so it's free)
    g.fillText(emoji, box / 2, box / 2);
    sprites.set(emoji, c);
  }
}

function makeStar() {
  const angle = rand(0, Math.PI * 2);
  return {
    x: rand(0, width),
    y: rand(0, height),
    vx: Math.cos(angle) * DRIFT,
    vy: Math.sin(angle) * DRIFT,
    size: rand(MIN_SIZE, MAX_SIZE),
    emoji: EMOJIS[Math.floor(Math.random() * EMOJIS.length)],
    alpha: rand(0.88, 1), // bright and colorful; the stickers sit on top, so they stay readable
    twinkle: rand(0, Math.PI * 2),
    spin: rand(-0.01, 0.01),
    angle: rand(0, Math.PI * 2),
  };
}

function resize() {
  const newDpr = Math.min(window.devicePixelRatio || 1, 2);
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = Math.round(width * newDpr);
  canvas.height = Math.round(height * newDpr);
  if (newDpr !== dpr || sprites.size === 0) {
    dpr = newDpr;
    makeSprites();
  }

  // roughly one per 9,000 px² of screen: ~48 on a phone, ~150 on a laptop
  const wanted = Math.max(48, Math.min(180, Math.round((width * height) / 9000)));
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

// f = how many 60fps frames' worth of time passed (1 on a smooth device, 2–3 on a slow one)
function update(f) {
  // the "wind" from the pointer fades out quickly once you stop moving
  const windFade = Math.pow(0.85, f);
  pointer.vx *= windFade;
  pointer.vy *= windFade;

  const slowDown = Math.pow(0.97, f);
  const speedUp = Math.pow(1.05, f);

  for (const s of stars) {
    // push from the pointer, stronger the closer it is
    const dx = s.x - pointer.x;
    const dy = s.y - pointer.y;
    if (Math.abs(dx) < PUSH_RADIUS && Math.abs(dy) < PUSH_RADIUS) {
      const dist = Math.hypot(dx, dy);
      if (dist < PUSH_RADIUS) {
        const falloff = (1 - dist / PUSH_RADIUS) * PUSH_STRENGTH * f;
        s.vx += pointer.vx * falloff;
        s.vy += pointer.vy * falloff;
      }
    }

    // a tiny random nudge so each one wanders on its own
    s.vx += rand(-0.03, 0.03) * f;
    s.vy += rand(-0.03, 0.03) * f;

    // ease back toward a gentle drift speed after being pushed
    const speed = Math.hypot(s.vx, s.vy);
    if (speed > MAX_SPEED) {
      s.vx = (s.vx / speed) * MAX_SPEED;
      s.vy = (s.vy / speed) * MAX_SPEED;
    } else if (speed > DRIFT) {
      s.vx *= slowDown;
      s.vy *= slowDown;
    } else if (speed < DRIFT * 0.5) {
      s.vx *= speedUp;
      s.vy *= speedUp;
    }

    s.x += s.vx * f;
    s.y += s.vy * f;
    s.angle += (s.spin + s.vx * 0.01) * f;
    s.twinkle += 0.03 * f;

    // wrap around the edges
    const m = s.size;
    if (s.x < -m) s.x = width + m;
    if (s.x > width + m) s.x = -m;
    if (s.y < -m) s.y = height + m;
    if (s.y > height + m) s.y = -m;
  }
}

function draw() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (const s of stars) {
    const sprite = sprites.get(s.emoji);
    if (!sprite) continue;
    ctx.globalAlpha = reduceMotion ? s.alpha : s.alpha * (0.9 + 0.1 * Math.sin(s.twinkle));
    // move + rotate in one step (cheaper than save/translate/rotate/restore)
    const cos = Math.cos(s.angle) * dpr;
    const sin = Math.sin(s.angle) * dpr;
    ctx.setTransform(cos, sin, -sin, cos, s.x * dpr, s.y * dpr);
    const drawn = s.size * 1.4; // the sprite box is 1.4× the emoji size
    ctx.drawImage(sprite, -drawn / 2, -drawn / 2, drawn, drawn);
  }
  ctx.globalAlpha = 1;
}

let last = 0;
function loop(now) {
  // cap at 3 frames so coming back to the tab doesn't make them jump
  const f = last ? Math.min((now - last) / (1000 / 60), 3) : 1;
  last = now;
  update(f);
  draw();
  requestAnimationFrame(loop);
}

document.addEventListener("visibilitychange", () => {
  last = 0; // don't count time spent in another tab
});

window.addEventListener("resize", resize);
resize();

if (!reduceMotion) {
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("pointerdown", onPointerMove, { passive: true });
  document.addEventListener("pointerleave", onPointerLeave);
  window.addEventListener("blur", onPointerLeave);
  requestAnimationFrame(loop);
}
