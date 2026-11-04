// Shrinks a photo in the browser before it is saved in Firestore (complaint photos, 4 Nov 2026): longest side 1280px,
// JPEG, quality lowered step by step until it is under MAX_BYTES. Returns { data: 'data:image/jpeg;base64,...', w, h, size }.
// Throws a plain message for files the browser can't read (e.g. HEIC on Windows) or that stay too big.
export const MAX_BYTES = 300 * 1024;
const MAX_SIDE = 1280;

function load(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`${file.name} can't be read here. Use a JPG or PNG photo, or a screenshot.`)); };
    img.src = url;
  });
}
const bytesOf = dataUrl => Math.ceil((dataUrl.length - dataUrl.indexOf(',') - 1) * 3 / 4);

export async function shrinkImage(file) {
  if (!file.type.startsWith('image/')) throw new Error(`${file.name} is not a photo.`);
  const img = await load(file);
  let w = img.naturalWidth, h = img.naturalHeight;
  for (let side = MAX_SIDE; side >= 640; side -= 320) {
    const k = Math.min(1, side / Math.max(w, h)), cw = Math.round(img.naturalWidth * k), ch = Math.round(img.naturalHeight * k);
    const c = document.createElement('canvas'); c.width = cw; c.height = ch;
    const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cw, ch); ctx.drawImage(img, 0, 0, cw, ch);
    for (let q = 0.82; q >= 0.5; q -= 0.08) {
      const data = c.toDataURL('image/jpeg', q), size = bytesOf(data);
      if (size <= MAX_BYTES) return { data, w: cw, h: ch, size };
    }
  }
  throw new Error(`${file.name} is too detailed to send. Try a smaller photo or a screenshot.`);
}
