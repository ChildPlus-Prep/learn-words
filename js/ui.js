// Small DOM helpers shared by the kids' page and the admin page.
// Everything goes through textContent, never innerHTML, so names can't inject HTML.

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? "" : value);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

// An <img>, or a big emoji when there's no image (or the image fails to load).
export function picture(src, emoji, alt = "") {
  // plain text of 3+ letters/digits (like "Mon" or "Jan") gets a smaller size so it fits
  // 3+ digits (like "100") get a slightly smaller size so they fit the card
  const longText = /^(?=.*\p{L})[\p{L}\p{N}]{3,}$/u.test(emoji || "");
  const longNumber = /^\p{N}{3,}$/u.test(emoji || "");
  const cls = longText ? "emoji text-long" : longNumber ? "emoji text-num" : "emoji";
  const fallback = () =>
    el("span", { class: cls, style: longText ? `--len:${emoji.length}` : null, "aria-hidden": "true" }, emoji || "❓");
  if (!src) return fallback();
  const img = el("img", { src, alt, loading: "lazy", draggable: "false" });
  img.addEventListener("error", () => img.replaceWith(fallback()), { once: true });
  return img;
}

export function slugify(text) {
  return String(text)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// The four classes, in order. An item tagged with a class shows in that class
// and every class after it. Items with no class count as Pre-school (shown everywhere).
export const LEVELS = [
  { id: "preschool", name: "Pre-school", emoji: "🧸" },
  { id: "k1", name: "K1", emoji: "🎒" },
  { id: "k2", name: "K2", emoji: "✏️" },
  { id: "k3", name: "K3", emoji: "📚" },
];

export function levelIndex(id) {
  const i = LEVELS.findIndex((l) => l.id === id);
  return i === -1 ? 0 : i;
}

// Words set to this are kept (and editable in the admin page) but shown in no class.
export const LATER = { id: "later", name: "Saved for later" };

/** The value for the admin class menu: a class id, or LATER.id. */
export function levelValue(item) {
  return item.level === LATER.id ? LATER.id : LEVELS[levelIndex(item.level)].id;
}

/** True if `item` should be shown to children in class `levelId`. */
export function visibleIn(item, levelId) {
  if (item.level === LATER.id) return false;
  return levelIndex(item.level) <= levelIndex(levelId);
}
