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
  const fallback = () => el("span", { class: "emoji", "aria-hidden": "true" }, emoji || "❓");
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
