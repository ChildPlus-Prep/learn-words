// Image resizing and microphone recording, all done in the browser.

/** Shrinks an image so its longest side is at most maxSize px. Returns a WebP (or JPEG) Blob. */
export async function resizeImage(file, maxSize = 800, quality = 0.8) {
  let source;
  try {
    source = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    source = await loadImageElement(file); // older Safari
  }
  const width = source.width;
  const height = source.height;
  const scale = Math.min(1, maxSize / Math.max(width, height));
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff"; // white behind transparent PNGs
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(source, 0, 0, w, h);
  source.close?.();

  let blob = await toBlob(canvas, "image/webp", quality);
  if (!blob || blob.type !== "image/webp") blob = await toBlob(canvas, "image/jpeg", quality);
  return blob;
}

export function imageExt(blob) {
  return blob.type === "image/webp" ? "webp" : "jpg";
}

function toBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function loadImageElement(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file doesn't look like an image."));
    };
    img.src = url;
  });
}

/** Starts recording from the mic. Call .stop() to get the audio Blob. Auto-stops after maxSeconds. */
export async function startRecording(maxSeconds = 5) {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    throw new Error("This browser can't record audio. Try uploading a sound file instead.");
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const preferred = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus", "audio/webm"];
  const mimeType = preferred.find((t) => MediaRecorder.isTypeSupported(t));
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);

  let resolveDone;
  const done = new Promise((r) => (resolveDone = r));
  recorder.onstop = () => {
    stream.getTracks().forEach((t) => t.stop());
    const type = (recorder.mimeType || mimeType || "audio/webm").split(";")[0];
    resolveDone(new Blob(chunks, { type }));
  };

  recorder.start();
  const timer = setTimeout(() => recorder.state !== "inactive" && recorder.stop(), maxSeconds * 1000);

  return {
    done,
    stop() {
      clearTimeout(timer);
      if (recorder.state !== "inactive") recorder.stop();
      return done;
    },
  };
}

export function audioExt(blob, fileName = "") {
  const fromName = fileName.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  if (fromName) return fromName;
  const type = blob.type;
  if (type.includes("webm")) return "webm";
  if (type.includes("mp4") || type.includes("m4a") || type.includes("aac")) return "m4a";
  if (type.includes("ogg")) return "ogg";
  if (type.includes("mpeg") || type.includes("mp3")) return "mp3";
  if (type.includes("wav")) return "wav";
  return "webm";
}
