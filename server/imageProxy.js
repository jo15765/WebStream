const MAX_CONCURRENT = 8;
let active = 0;
const queue = [];

function runNext() {
  if (active >= MAX_CONCURRENT || queue.length === 0) return;
  const job = queue.shift();
  active += 1;
  job()
    .catch(() => {})
    .finally(() => {
      active -= 1;
      runNext();
    });
}

function enqueue(task) {
  return new Promise((resolve, reject) => {
    queue.push(async () => {
      try {
        resolve(await task());
      } catch (e) {
        reject(e);
      }
    });
    runNext();
  });
}

const EMPTY_GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

export async function fetchProxiedImage(target) {
  return enqueue(async () => {
    const upstream = await fetch(target, {
      redirect: "follow",
      headers: {
        Accept: "image/*,*/*;q=0.8",
        "User-Agent":
          "Mozilla/5.0 (compatible; WebStream/1.0; +https://localhost)",
      },
    });
    if (!upstream.ok) {
      return { ok: false, status: upstream.status };
    }
    const ct = upstream.headers.get("content-type") || "image/png";
    const buf = Buffer.from(await upstream.arrayBuffer());
    return { ok: true, contentType: ct, body: buf };
  });
}

export function sendPlaceholder(res) {
  res.status(200);
  res.setHeader("Content-Type", "image/gif");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.send(EMPTY_GIF);
}
