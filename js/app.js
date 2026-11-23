// Kids' side: reads data/catalog.json and shows categories and pictures.
// Tapping a picture plays its sound, or says the word with the browser's voice.

import { el, picture } from "./ui.js";

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

function renderHome() {
  const grid = el("div", { class: "grid" });
  catalog.categories.forEach((cat) => {
    const first = cat.items[0] || {};
    const tile = el(
      "button",
      {
        class: "tile",
        "aria-label": cat.name,
        onclick: () => {
          speak(cat.name);
          location.hash = `#/c/${encodeURIComponent(cat.id)}`;
        },
      },
      el("div", { class: "pic" }, picture(cat.cover || first.image, cat.emoji || first.emoji, cat.name)),
      el("span", { class: "label" }, cat.name)
    );
    grid.append(tile);
  });

  app.replaceChildren(
    el("header", { class: "top" }, el("h1", {}, "Learn Words"), el("span", { class: "tagline" }, "my sticker book")),
    catalog.categories.length ? grid : el("p", { class: "empty" }, "No categories yet.")
  );
}

function renderCategory(id) {
  const cat = catalog.categories.find((c) => c.id === id);
  if (!cat) {
    location.hash = "#/";
    return;
  }

  const grid = el("div", { class: "grid" });
  cat.items.forEach((item) => {
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
  });

  app.replaceChildren(
    el(
      "header",
      { class: "top" },
      el("button", { class: "back", "aria-label": "Back", onclick: () => { stopAll(); location.hash = "#/"; } }, backIcon()),
      el("h1", {}, cat.name)
    ),
    cat.items.length ? grid : el("p", { class: "empty" }, "No pictures here yet.")
  );
}

function route() {
  const m = location.hash.match(/^#\/c\/(.+)$/);
  if (m) renderCategory(decodeURIComponent(m[1]));
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
