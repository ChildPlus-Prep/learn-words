// Kids' side: reads data/catalog.json and shows categories and pictures.
// Tapping a picture plays its sound, or says the word with the browser's voice.

import { el, picture, LEVELS, visibleIn } from "./ui.js";

const app = document.getElementById("app");
let catalog = null;
let currentAudio = null;
let playingTile = null;

async function loadCatalog() {
  // ?v= skips the browser cache so newly added words show up quickly
  const res = await fetch(`data/catalog.json?v=${Date.now()}`);
  if (!res.ok) throw new Error(`Could not load catalog (${res.status})`);
  return res.json();
}

// Shows the speaker badge on a tile while its word is being said.
function setPlaying(tile) {
  if (playingTile) playingTile.classList.remove("playing");
  playingTile = tile;
  if (tile) tile.classList.add("playing");
}

function speak(text, onDone) {
  if (!("speechSynthesis" in window)) return onDone?.();
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  u.rate = 0.85;
  u.pitch = 1.1;
  if (onDone) {
    u.addEventListener("end", onDone);
    u.addEventListener("error", onDone);
  }
  speechSynthesis.speak(u);
}

function stopAll() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  setPlaying(null);
}

function playItem(item, tile) {
  stopAll();
  setPlaying(tile);
  const done = () => {
    if (playingTile === tile) setPlaying(null);
  };
  if (!item.sound) return speak(item.name, done);

  let fellBack = false;
  const fallback = () => {
    if (!fellBack) {
      fellBack = true;
      speak(item.name, done);
    }
  };
  const audio = new Audio(item.sound);
  currentAudio = audio;
  audio.addEventListener("ended", done);
  audio.addEventListener("error", fallback);
  audio.play().catch(fallback);
}

// Chevron for the back button (SVG needs its own namespace, so el() can't make it).
function backIcon() {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  const attrs = { width: 32, height: 32, viewBox: "0 0 24 24", fill: "none", stroke: "#fff", "stroke-width": 3, "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" };
  for (const [k, v] of Object.entries(attrs)) svg.setAttribute(k, v);
  const path = document.createElementNS(ns, "path");
  path.setAttribute("d", "M15 5l-7 7 7 7");
  svg.append(path);
  return svg;
}

function bounce(node) {
  node.classList.remove("pop");
  void node.offsetWidth; // restart the animation
  node.classList.add("pop");
}

function backButton(hash) {
  return el("button", { class: "back", "aria-label": "Back", onclick: () => { stopAll(); location.hash = hash; } }, backIcon());
}

// Home: the four classes.
function renderHome() {
  const grid = el("div", { class: "grid classes" });
  for (const level of LEVELS) {
    grid.append(
      el(
        "button",
        {
          class: "tile",
          "aria-label": level.name,
          onclick: () => {
            speak(level.name);
            location.hash = `#/k/${level.id}`;
          },
        },
        el("div", { class: "pic" }, picture(null, level.emoji, level.name)),
        el("span", { class: "label" }, level.name)
      )
    );
  }

  app.replaceChildren(
    el("header", { class: "top" }, el("h1", {}, "Learn Words"), el("span", { class: "tagline" }, "my sticker book")),
    grid
  );
}

// A class: its categories (only ones with at least one word for this class).
function renderClass(levelId) {
  const level = LEVELS.find((l) => l.id === levelId);
  if (!level) {
    location.hash = "#/";
    return;
  }

  const grid = el("div", { class: "grid" });
  for (const cat of catalog.categories) {
    const items = (cat.items || []).filter((item) => visibleIn(item, level.id));
    if (!items.length) continue;
    const first = items[0];
    grid.append(
      el(
        "button",
        {
          class: "tile",
          "aria-label": cat.name,
          onclick: () => {
            speak(cat.name);
            location.hash = `#/k/${level.id}/c/${encodeURIComponent(cat.id)}`;
          },
        },
        el("div", { class: "pic" }, picture(cat.cover || first.image, cat.emoji || first.emoji, cat.name)),
        el("span", { class: "label" }, cat.name)
      )
    );
  }

  app.replaceChildren(
    el("header", { class: "top" }, backButton("#/"), el("h1", {}, level.name)),
    grid.children.length ? grid : el("p", { class: "empty" }, "No pictures for this class yet.")
  );
}

// A category inside a class: only the words for this class.
function renderCategory(levelId, catId) {
  const level = LEVELS.find((l) => l.id === levelId);
  const cat = catalog.categories.find((c) => c.id === catId);
  if (!level || !cat) {
    location.hash = level ? `#/k/${level.id}` : "#/";
    return;
  }

  const grid = el("div", { class: "grid" });
  for (const item of (cat.items || []).filter((i) => visibleIn(i, level.id))) {
    const tile = el(
      "button",
      {
        class: "tile",
        "aria-label": item.name,
        onclick: () => {
          playItem(item, tile);
          bounce(tile);
        },
      },
      el("div", { class: "pic" }, picture(item.image, item.emoji, item.name)),
      el("span", { class: "label" }, item.name)
    );
    grid.append(tile);
  }

  app.replaceChildren(
    el("header", { class: "top" }, backButton(`#/k/${level.id}`), el("h1", {}, cat.name)),
    grid.children.length ? grid : el("p", { class: "empty" }, "No pictures here yet.")
  );
}

function route() {
  // don't stopAll() here: tapping a tile says its name and then changes the page
  setPlaying(null);
  const hash = location.hash;
  let m;
  if ((m = hash.match(/^#\/k\/([^/]+)\/c\/(.+)$/))) renderCategory(decodeURIComponent(m[1]), decodeURIComponent(m[2]));
  else if ((m = hash.match(/^#\/k\/([^/]+)$/))) renderClass(decodeURIComponent(m[1]));
  else renderHome();
  window.scrollTo(0, 0);
}

async function start() {
  try {
    catalog = await loadCatalog();
    catalog.categories ||= [];
    window.addEventListener("hashchange", route);
    route();
  } catch (err) {
    app.replaceChildren(el("p", { class: "empty" }, "Oops, could not load the pictures. Please refresh."));
    console.error(err);
  }
}

start();
