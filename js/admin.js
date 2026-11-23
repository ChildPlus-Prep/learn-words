import { GitHubRepo } from "./github.js";
import { resizeImage, imageExt, startRecording, audioExt } from "./media.js";
import { el, picture, slugify, LEVELS, levelIndex } from "./ui.js";

const $ = (id) => document.getElementById(id);
const STORE_KEY = "learnWordsAdmin";
const MAX_SOUND_BYTES = 2 * 1024 * 1024;

let gh = null;
let catalog = { categories: [] };
let resizedImage = null; // Blob
let catImage = null; // Blob, the new category's picture
let soundBlob = null; // Blob
let soundName = "";
let recording = null;
let busy = false;

// ---------- settings ----------

function guessRepo() {
  const owner = location.hostname.match(/^([^.]+)\.github\.io$/)?.[1] || "";
  const first = location.pathname.split("/").filter(Boolean)[0];
  const repo = owner && first && !first.endsWith(".html") ? first : "learn-words";
  return { owner, repo, branch: "main" };
}

function loadSettings() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
  } catch {}
  const guess = guessRepo();
  $("owner").value = saved.owner || guess.owner;
  $("repo").value = saved.repo || guess.repo;
  $("branch").value = saved.branch || guess.branch;
  $("token").value = saved.token || "";
  return saved;
}

function saveSettings(s) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(s));
  } catch {}
}

// ---------- status helpers ----------

function setStatus(id, text, kind = "") {
  const node = $(id);
  node.textContent = text;
  node.className = `status ${kind}`;
}

async function run(statusId, fn) {
  if (busy) return;
  busy = true;
  document.body.classList.add("busy");
  try {
    await fn((msg) => setStatus(statusId, msg));
  } catch (err) {
    console.error(err);
    setStatus(statusId, err.message || String(err), "error");
  } finally {
    busy = false;
    document.body.classList.remove("busy");
  }
}

// ---------- connect ----------

async function connect() {
  const settings = {
    owner: $("owner").value.trim(),
    repo: $("repo").value.trim(),
    branch: $("branch").value.trim() || "main",
    token: $("token").value.trim(),
  };
  if (!settings.owner || !settings.repo || !settings.token) {
    setStatus("connectStatus", "Fill in owner, repo and token.", "error");
    return;
  }
  await run("connectStatus", async (status) => {
    status("Checking access…");
    const repo = new GitHubRepo(settings);
    await repo.checkAccess();
    catalog = await repo.readCatalog();
    catalog.categories ||= [];
    gh = repo;
    saveSettings(settings);
    $("adminArea").hidden = false;
    setStatus("connectStatus", `Connected to ${settings.owner}/${settings.repo} ✓`, "ok");
    renderAll();
  });
}

function logout() {
  try {
    localStorage.removeItem(STORE_KEY);
  } catch {}
  $("token").value = "";
  gh = null;
  $("adminArea").hidden = true;
  setStatus("connectStatus", "Token removed from this browser.");
}

// ---------- rendering ----------

function renderAll() {
  renderCategorySelect();
  renderManageList();
}

function renderCategorySelect() {
  const select = $("itemCategory");
  const previous = select.value;
  select.replaceChildren(
    ...catalog.categories.map((c) => el("option", { value: c.id }, c.name))
  );
  if (catalog.categories.some((c) => c.id === previous)) select.value = previous;
  $("saveItemBtn").disabled = !catalog.categories.length;
  if (!catalog.categories.length) setStatus("itemStatus", "Add a category first.");
}

function renderManageList() {
  const list = $("manageList");
  if (!catalog.categories.length) {
    list.replaceChildren(el("p", { class: "hint" }, "Nothing yet."));
    return;
  }
  list.replaceChildren(
    ...catalog.categories.map((cat) =>
      el(
        "div",
        { class: "manage-cat" },
        el(
          "div",
          { class: "manage-head" },
          el("div", { class: "thumb cover" }, picture(cat.cover, cat.emoji || cat.items[0]?.emoji || "🖼️", cat.name)),
          el("strong", {}, cat.name),
          el("span", { class: "hint" }, `${cat.items.length} picture${cat.items.length === 1 ? "" : "s"}`),
          el(
            "label",
            { class: "file-btn" },
            cat.cover ? "Change picture" : "Add picture",
            el("input", { type: "file", accept: "image/*", class: "sr-only", onchange: (e) => setCategoryCover(cat, e.target.files[0]) })
          ),
          cat.cover
            ? el("button", { class: "secondary small", type: "button", onclick: () => removeCategoryCover(cat) }, "Remove picture")
            : null,
          el("button", { class: "danger small", type: "button", onclick: () => deleteCategory(cat) }, "Delete category")
        ),
        el(
          "div",
          { class: "chips" },
          cat.items.map((item) =>
            el(
              "div",
              { class: "chip" },
              el("div", { class: "thumb" }, picture(item.image, item.emoji || "⏳", item.name)),
              el("span", {}, item.name),
              levelSelect(levelIndex(item.level), {
                class: "level",
                title: "Class",
                "aria-label": `Class for ${item.name}`,
                onchange: (e) => setItemLevel(cat, item, e.target.value),
              }),
              item.sound
                ? el("button", { class: "icon", type: "button", title: "Play", onclick: () => new Audio(item.sound).play().catch(() => {}) }, "▶")
                : null,
              el("button", { class: "icon", type: "button", title: "Delete", onclick: () => deleteItem(cat, item) }, "✕")
            )
          )
        )
      )
    )
  );
}

function levelSelect(selectedIndex, attrs = {}) {
  const select = el(
    "select",
    attrs,
    LEVELS.map((l, i) => el("option", { value: l.id, selected: i === selectedIndex }, i === LEVELS.length - 1 ? l.name : `${l.name}+`))
  );
  select.value = LEVELS[selectedIndex].id;
  return select;
}

// ---------- categories ----------

async function addCategory(e) {
  e.preventDefault();
  const name = $("catName").value.trim();
  const emoji = $("catEmoji").value.trim();
  const id = slugify(name);
  if (!id) return setStatus("categoryStatus", "Use letters or numbers in the name.", "error");

  const cover = catImage ? coverPath(id, catImage) : null;
  const uploads = cover ? [{ path: cover, blob: catImage }] : [];

  await run("categoryStatus", async (status) => {
    const result = await gh.commit(
      `Add category: ${name}`,
      (cat) => {
        if (cat.categories.some((c) => c.id === id)) throw new Error(`"${name}" already exists.`);
        cat.categories.push({ id, name, ...(emoji ? { emoji } : {}), ...(cover ? { cover } : {}), items: [] });
        return { uploads };
      },
      status
    );
    catalog = result.catalog;
    $("categoryForm").reset();
    catImage = null;
    $("catImagePreview").replaceChildren();
    $("catImageInfo").textContent = "";
    renderAll();
    $("itemCategory").value = id;
    setStatus("categoryStatus", `Added "${name}" ✓`, "ok");
  });
}

async function deleteCategory(cat) {
  if (!confirm(`Delete "${cat.name}" and all ${cat.items.length} pictures in it?`)) return;
  await run("itemStatus", async (status) => {
    const result = await gh.commit(
      `Delete category: ${cat.name}`,
      (data) => {
        const found = data.categories.find((c) => c.id === cat.id);
        if (!found) return {};
        data.categories = data.categories.filter((c) => c.id !== cat.id);
        return { deletes: found.items.flatMap(mediaPaths).concat(found.cover ? [found.cover] : []).filter(isMedia) };
      },
      status
    );
    catalog = result.catalog;
    renderAll();
    setStatus("itemStatus", `Deleted "${cat.name}" ✓`, "ok");
  });
}

// A new file name each time, so kids' browsers never show an old cached picture.
function coverPath(catId, blob) {
  return `media/${catId}/cover-${Date.now().toString(36)}.${imageExt(blob)}`;
}

async function setCategoryCover(cat, file) {
  if (!file) return;
  await run("itemStatus", async (status) => {
    status("Resizing…");
    const blob = await resizeImage(file, 800, 0.8);
    const path = coverPath(cat.id, blob);
    const result = await gh.commit(
      `Set picture for category: ${cat.name}`,
      (data) => {
        const c = data.categories.find((x) => x.id === cat.id);
        if (!c) throw new Error("That category was deleted. Refresh the page.");
        const old = c.cover;
        c.cover = path;
        return { uploads: [{ path, blob }], deletes: [old].filter(isMedia) };
      },
      status
    );
    catalog = result.catalog;
    renderAll();
    setStatus("itemStatus", `Picture for "${cat.name}" saved ✓ (${kb(file.size)} → ${kb(blob.size)})`, "ok");
  });
  renderManageList(); // clears the file input if the save didn't run
}

async function removeCategoryCover(cat) {
  if (!confirm(`Remove the picture for "${cat.name}"?`)) return;
  await run("itemStatus", async (status) => {
    const result = await gh.commit(
      `Remove picture for category: ${cat.name}`,
      (data) => {
        const c = data.categories.find((x) => x.id === cat.id);
        if (!c?.cover) return {};
        const old = c.cover;
        delete c.cover;
        return { deletes: [old].filter(isMedia) };
      },
      status
    );
    catalog = result.catalog;
    renderAll();
    setStatus("itemStatus", `Removed the picture for "${cat.name}" ✓`, "ok");
  });
}

async function onCatImagePicked() {
  catImage = await previewResized($("catImage"), $("catImagePreview"), $("catImageInfo"));
}

// ---------- items ----------

// Resizes the picked image (longest side 800px), shows a preview, and returns the Blob.
async function previewResized(input, preview, info) {
  const file = input.files[0];
  preview.replaceChildren();
  info.textContent = "";
  if (!file) return null;
  try {
    info.textContent = "Resizing…";
    const blob = await resizeImage(file, 800, 0.8);
    preview.replaceChildren(el("img", { src: URL.createObjectURL(blob), alt: "preview" }));
    info.textContent = `${kb(file.size)} → ${kb(blob.size)} (${imageExt(blob).toUpperCase()})`;
    return blob;
  } catch (err) {
    info.textContent = err.message;
    input.value = "";
    return null;
  }
}

async function onImagePicked() {
  resizedImage = await previewResized($("itemImage"), $("imagePreview"), $("imageInfo"));
}

async function setItemLevel(cat, item, levelId) {
  const level = LEVELS.find((l) => l.id === levelId);
  if (!level || busy) return renderManageList();
  await run("itemStatus", async (status) => {
    const result = await gh.commit(
      `Move "${item.name}" to ${level.name}`,
      (data) => {
        const found = data.categories.find((c) => c.id === cat.id)?.items.find((i) => i.id === item.id);
        if (!found) throw new Error("That picture was deleted. Refresh the page.");
        found.level = level.id;
      },
      status
    );
    catalog = result.catalog;
    renderAll();
    setStatus("itemStatus", `"${item.name}" now shows from ${level.name} up ✓`, "ok");
  });
  renderManageList(); // puts the menu back if the save failed
}

function setSound(blob, name = "") {
  soundBlob = blob;
  soundName = name;
  const box = $("soundPreview");
  if (!blob) return box.replaceChildren();
  const url = URL.createObjectURL(blob);
  box.replaceChildren(
    el("audio", { src: url, controls: true }),
    el("button", { type: "button", class: "secondary small", onclick: () => { setSound(null); $("itemSound").value = ""; } }, "Remove sound")
  );
}

function onSoundPicked() {
  const file = $("itemSound").files[0];
  if (!file) return setSound(null);
  if (file.size > MAX_SOUND_BYTES) {
    $("itemSound").value = "";
    setStatus("itemStatus", "That sound file is over 2 MB. Try a shorter clip.", "error");
    return setSound(null);
  }
  setSound(file, file.name);
}

async function toggleRecording() {
  const btn = $("recordBtn");
  if (recording) {
    await recording.stop(); // the recording.done handler below shows the preview
    return;
  }
  try {
    recording = await startRecording(5);
    btn.textContent = "⏹ Stop (max 5s)";
    btn.classList.add("recording");
    recording.done.then((blob) => {
      recording = null;
      btn.textContent = "🎙️ Record again";
      btn.classList.remove("recording");
      $("itemSound").value = "";
      setSound(blob, "");
    });
  } catch (err) {
    recording = null;
    setStatus("itemStatus", err.message || "Couldn't use the microphone.", "error");
  }
}

async function addItem(e) {
  e.preventDefault();
  if (recording) await recording.stop();

  const catId = $("itemCategory").value;
  const name = $("itemName").value.trim();
  const emoji = $("itemEmoji").value.trim();
  const level = $("itemLevel").value || LEVELS[0].id;
  const id = slugify(name);
  if (!catId) return setStatus("itemStatus", "Pick a category.", "error");
  if (!id) return setStatus("itemStatus", "Use letters or numbers in the word.", "error");
  if (!resizedImage && !emoji) return setStatus("itemStatus", "Add a picture or an emoji.", "error");

  const uploads = [];
  let imagePath;
  let soundPath;
  if (resizedImage) {
    imagePath = `media/${catId}/${id}.${imageExt(resizedImage)}`;
    uploads.push({ path: imagePath, blob: resizedImage });
  }
  if (soundBlob) {
    soundPath = `media/${catId}/${id}.${audioExt(soundBlob, soundName)}`;
    uploads.push({ path: soundPath, blob: soundBlob });
  }

  await run("itemStatus", async (status) => {
    const result = await gh.commit(
      `Add "${name}"`,
      (data) => {
        const cat = data.categories.find((c) => c.id === catId);
        if (!cat) throw new Error("That category was deleted. Refresh the page.");
        cat.items ||= [];
        if (cat.items.some((i) => i.id === id)) throw new Error(`"${name}" is already in ${cat.name}. Delete it first to replace it.`);
        cat.items.push({
          id,
          name,
          ...(imagePath ? { image: imagePath } : {}),
          ...(emoji ? { emoji } : {}),
          ...(soundPath ? { sound: soundPath } : {}),
          level,
        });
        return { uploads };
      },
      status
    );
    catalog = result.catalog;
    resetItemForm();
    renderAll();
    setStatus("itemStatus", `Saved "${name}" ✓ It'll be live in about a minute.`, "ok");
  });
}

async function deleteItem(cat, item) {
  if (!confirm(`Delete "${item.name}" from ${cat.name}?`)) return;
  await run("itemStatus", async (status) => {
    const result = await gh.commit(
      `Delete "${item.name}" from ${cat.name}`,
      (data) => {
        const c = data.categories.find((x) => x.id === cat.id);
        const found = c?.items.find((i) => i.id === item.id);
        if (!found) return {};
        c.items = c.items.filter((i) => i.id !== item.id);
        return { deletes: mediaPaths(found).filter(isMedia) };
      },
      status
    );
    catalog = result.catalog;
    renderAll();
    setStatus("itemStatus", `Deleted "${item.name}" ✓`, "ok");
  });
}

function resetItemForm() {
  const keepCategory = $("itemCategory").value;
  const keepLevel = $("itemLevel").value;
  $("itemForm").reset();
  $("itemCategory").value = keepCategory;
  $("itemLevel").value = keepLevel;
  resizedImage = null;
  $("imagePreview").replaceChildren();
  $("imageInfo").textContent = "";
  $("recordBtn").textContent = "🎙️ Record";
  setSound(null);
  $("itemName").focus();
}

// ---------- utils ----------

const mediaPaths = (item) => [item.image, item.sound].filter(Boolean);
const isMedia = (path) => typeof path === "string" && path.startsWith("media/");
const kb = (bytes) => (bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`);

// ---------- wire up ----------

$("connectBtn").addEventListener("click", connect);
$("logoutBtn").addEventListener("click", logout);
$("token").addEventListener("keydown", (e) => e.key === "Enter" && connect());
$("categoryForm").addEventListener("submit", addCategory);
$("itemForm").addEventListener("submit", addItem);
$("itemImage").addEventListener("change", onImagePicked);
$("catImage").addEventListener("change", onCatImagePicked);
$("itemLevel").replaceChildren(...levelSelect(0).children);
$("itemLevel").value = LEVELS[0].id;
$("itemSound").addEventListener("change", onSoundPicked);
$("recordBtn").addEventListener("click", toggleRecording);

const saved = loadSettings();
if (saved.token) connect();
