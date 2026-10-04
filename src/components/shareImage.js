// Small browser helpers shared by the Year / Month / Finished share cards:
// load a poster for the canvas, turn a canvas into a PNG, save it, and share it.

export const APP_URL = 'https://aceasif.github.io/watchnext/';

// Load an image for canvas export. crossOrigin='anonymous' means it either loads
// clean (no canvas taint) or fails: it never taints. The cache-bust param forces a
// fresh CORS request instead of reusing the non-CORS <img> already cached by the
// card on screen. Failures resolve to null so the caller can draw a placeholder.
export function loadImg(url) {
  return new Promise((resolve) => {
    if (!url) return resolve(null);
    const im = new Image();
    im.crossOrigin = 'anonymous';
    im.onload = () => resolve(im);
    im.onerror = () => resolve(null);
    im.src = url + (url.includes('?') ? '&' : '?') + 'cors=1';
  });
}

export function canvasToBlob(canvas) {
  return new Promise((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error('toBlob returned null'))), 'image/png')
  );
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Share text with the app link; falls back to copying it. Resolves to
// 'shared' | 'copied' | 'cancelled' | 'failed'.
export async function shareText({ title, text }) {
  try {
    if (navigator.share) {
      await navigator.share({ title, text, url: APP_URL });
      return 'shared';
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return 'cancelled'; // the person dismissed the share sheet
  }
  try {
    await navigator.clipboard.writeText(`${text} ${APP_URL}`);
    return 'copied';
  } catch {
    return 'failed'; // clipboard blocked: nothing more to do without a dependency
  }
}

// Share the picture itself where the browser can share files (phones), otherwise
// the text. Same resolved values as shareText.
export async function shareImageFile({ blob, filename, title, text }) {
  try {
    const file = new File([blob], filename, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title, text: `${text} ${APP_URL}` });
      return 'shared';
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return 'cancelled';
  }
  return shareText({ title, text });
}
