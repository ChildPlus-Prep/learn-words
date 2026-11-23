// Kids' side: reads data/catalog.json and shows categories and pictures.
// Tapping a picture plays its sound, or says the word with the browser's voice.

import { el, picture } from "./ui.js";

const app = document.getElementById("app");
let catalog = null;
let currentAudio = null;

async function loadCatalog() {
  // ?v= skips the browser cache so newly added words show up quickly
  const res = await fetch(`data/catalog.json?v=${Date.now()}`);
  if (!res.ok) throw new Error(`Could not load catalog (${res.status})`);
  return res.json();
}

function speak(text) {
  if (!("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  u.rate = 0.85;
  u.pitch = 1.1;
  speechSynthesis.speak(u);
}

function stopAll() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  if ("speechSynthesis" in window) speechSynthesis.cancel();
}

function playItem(item) {
  stopAll();
  if (!item.sound) return speak(item.name);

  let fellBack = false;
  const fallback = () => {
    if (!fellBack) {
      fellBack = true;
      speak(item.name);
    }
  };
  const audio = new Audio(item.sound);
  currentAudio = audio;
  audio.addEventListener("error", fallback);
  audio.play().catch(fallback);
}

function bounce(node) {
  node.classList.remove("pop");
  void node.offsetWidth; // restart the animation
  node.classList.add("pop");
}

const COLORS = ["#FFD6E0", "#D6F5FF", "#E3FFD6", "#FFF1C9", "#E8DDFF", "#FFE3CC"];

function renderHome() {
  const grid = el("div", { class: "grid" });
  catalog.categories.forEach((cat, i) => {
    const first = cat.items[0] || {};
    const tile = el(
      "button",
      {
        class: "tile",
        style: `--tile:${COLORS[i % COLORS.length]}`,
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
    el("header", { class: "top" }, el("h1", {}, "Learn Words")),
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
  cat.items.forEach((item, i) => {
    const tile = el(
      "button",
      {
        class: "tile",
        style: `--tile:${COLORS[i % COLORS.length]}`,
        "aria-label": item.name,
        onclick: () => {
          playItem(item);
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
      el("button", { class: "back", "aria-label": "Back", onclick: () => { stopAll(); location.hash = "#/"; } }, "⬅"),
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
