# WebStream

**WebStream** is a self-hosted web app that turns your **Xtream Codes** IPTV subscription into a clean, modern TV experience in the browser. You run WebStream on your own computer or home server; it talks to your provider and plays streams through a built-in player.

WebStream **does not** include channels, movies, or accounts. You bring your own provider credentials—the same portal URL, username, and password you would use in another IPTV app.

---

## Table of contents

- [What you can do](#what-you-can-do)
- [What you need before you start](#what-you-need-before-you-start)
- [Quick start with Docker (recommended)](#quick-start-with-docker-recommended)
- [Run without Docker (local development)](#run-without-docker-local-development)
- [Run in production without Docker](#run-in-production-without-docker)
- [First-time login](#first-time-login)
- [Using the app](#using-the-app)
- [Channel groups (organize Live TV)](#channel-groups-organize-live-tv)
- [Movies and series pagination](#movies-and-series-pagination)
- [Recordings (optional)](#recordings-optional)
- [Logs and troubleshooting](#logs-and-troubleshooting)
- [Where your data is stored](#where-your-data-is-stored)
- [Environment variables](#environment-variables)
- [HTTPS and reverse proxy](#https-and-reverse-proxy)
- [Updating after you pull new code](#updating-after-you-pull-new-code)
- [Project structure](#project-structure)
- [Disclaimer](#disclaimer)
- [License](#license)

---

## What you can do

| Area | What WebStream offers |
|------|------------------------|
| **Live TV** | Browse **groups** (provider categories), search channels, TV guide drawer, live HLS; **fixed sidebar** while you scroll |
| **Channel groups** | Rename, reorder, hide, or restore Live TV groups—**local only** in `webstream.json`; card grid with **All / Visible / Hidden** tabs |
| **Movies & series** | Full VOD libraries with search, sort, and **pagination (25 per page)**; pick episodes on series detail pages |
| **Playback** | HLS via **hls.js** (quality selection when the stream has multiple bitrates) |
| **Home** | **Continue watching** for movies and episodes you started |
| **Favorites** | Star live channels, movies, or series—stored on **your WebStream server**, shared for everyone who uses that server |
| **Search** | Global search from the sidebar or **⌘K** / **Ctrl+K**; jump to live, favorites, or guide-related results |
| **Settings** | Optional “remember login” on the server, recording folder, disconnect / forget saved login |
| **Record live** | Record the current live channel to a `.ts` file on the server (requires **ffmpeg**) |
| **Logs & info** | Local diagnostic log for stutter, lag, and connection issues—see [Logs and troubleshooting](#logs-and-troubleshooting) |

Behind the scenes, WebStream uses **Express** for API and session handling and **proxies** streams and images so your browser is not blocked by provider CORS rules.

---

## What you need before you start

1. **An Xtream Codes subscription** from a provider that gives you:
   - Portal URL (often `https://example.com:8080` or similar)
   - Username and password  
2. **A machine to run WebStream** (PC, Mac, Linux box, NAS, VPS, etc.) on your network or on the internet.  
3. **One of these setups:**
   - **[Docker](#quick-start-with-docker-recommended)** (easiest for most people), **or**
   - **Node.js 20+** and **npm** if you prefer to run Node directly.  
4. **Optional:** **ffmpeg** installed on the same machine where WebStream runs, only if you want **live recording**. The default Docker image does **not** include ffmpeg—you can install it in a custom image or run WebStream outside Docker with ffmpeg on the host.

You do **not** need to know React or webpack to *use* WebStream. You only need those tools if you want to change the UI or develop locally.

---

## Quick start with Docker (recommended)

These steps assume you have [Docker](https://docs.docker.com/get-docker/) and Docker Compose installed.

### 1. Get the code

```bash
git clone https://github.com/jo15765/WebStream.git
cd WebStream
```

If you forked the project, use your fork’s clone URL instead.

### 2. Create a secret for sessions

WebStream uses encrypted browser sessions. In production you must set a long random secret.

```bash
cp .env.example .env
```

Open `.env` in any text editor and set:

```env
SESSION_SECRET=paste-a-long-random-string-here
SESSION_COOKIE_SECURE=false
PORT=8080
```

Generate a good secret (macOS/Linux):

```bash
openssl rand -base64 32
```

Paste the output as `SESSION_SECRET` in `.env`.

> **Home network / HTTP:** Keep `SESSION_COOKIE_SECURE=false` when you open WebStream as `http://192.168.x.x:8080` or `http://localhost:8080`. If you use HTTPS in front of WebStream, set it to `true` (see [HTTPS and reverse proxy](#https-and-reverse-proxy)).

### 3. Build and start

```bash
docker compose up -d --build
```

### 4. Open the app

In a browser on the same network (or on the server itself):

**http://localhost:8080**

—or replace `localhost` with your server’s LAN IP, e.g. **http://192.168.1.50:8080**.

### 5. Log in

See [First-time login](#first-time-login).

### Docker volumes (your data survives restarts)

Compose creates two volumes:

| Volume | Inside container | Purpose |
|--------|------------------|---------|
| `webstream-data` | `/app/data` | Library (favorites, progress), optional saved login, settings, `errors.txt` log |
| `webstream-recordings` | `/app/recordings` | Default folder for live recordings |

To stop WebStream:

```bash
docker compose down
```

To stop and remove the local image (not your volumes):

```bash
docker compose down --rmi local
```

---

## Run without Docker (local development)

Use this if you want to hack on the code or run without containers.

### 1. Clone and install

```bash
git clone https://github.com/jo15765/WebStream.git
cd WebStream
cp .env.example .env
# Edit .env — set SESSION_SECRET
npm install
```

### 2. Start the dev server

```bash
npm run dev
```

This runs Express on port **8080** and rebuilds the React app when you change files.

Open **http://localhost:8080** and log in.

---

## Run in production without Docker

Build the static UI once, then run Node in production mode:

```bash
npm install
npm run build
```

Set secrets and start (example):

```bash
export SESSION_SECRET="your-long-random-secret"
export SESSION_COOKIE_SECURE=false   # use true only behind HTTPS
npm start
```

Again, open **http://localhost:8080** (or your server IP).

Optional recording paths (can also be set in **Settings** in the UI):

```bash
export WEBSTREAM_RECORDINGS_DIR="/path/to/recordings"
export WEBSTREAM_FFMPEG="/usr/bin/ffmpeg"
```

---

## First-time login

1. Open WebStream in your browser.  
2. On the login screen, enter:
   - **Portal URL** — exactly as your provider gave you (include `https://` and port if required).  
   - **Username** and **Password**.  
3. Optional: enable **Remember credentials on this server** so WebStream can auto-connect after a restart (stored in `data/webstream.json` on the server—not sent to GitHub if you use the provided `.gitignore`).  
4. Click connect. If login fails, check URL format, credentials, and that your provider allows connections from your IP.

After login you land on **Home**. Your session stays on the WebStream server until you disconnect or the session expires.

---

## Using the app

### Sidebar

| Menu item | Purpose |
|-----------|---------|
| **Home** | Continue watching and shortcuts |
| **Live TV** | Channel list, **groups** rail, player, EPG drawer; **Edit groups** link; right-click a group for quick rename or move |
| **Channel groups** | Full organizer: search, tabs, uniform-width **cards**, drag reorder, rename, hide/show |
| **Movies** / **Series** | VOD browsing, **paged grids (25 titles)**, playback |
| **Favorites** | Everything you starred |
| **Search** | Find channels and titles; keyboard **⌘K** / **Ctrl+K** |
| **Settings** | Recordings path, connection info, disconnect |
| **Logs & info** | What gets logged locally and where to find `errors.txt` |

### Watching

- Choose a channel or title; playback opens in the built-in player.  
- For live TV, use the on-screen controls (including **Record** when live recording is configured and ffmpeg is available).  
- Progress on movies and episodes is saved to the server so **Continue watching** works across browsers on the same WebStream instance.

### Tips

- If live TV buffers or stutters, your provider or network may be the limit—but check **Logs & info** and `data/errors.txt` for patterns.  
- Use **Disconnect session** in Settings when you want to log out without clearing saved login; use **Forget saved login** to remove stored portal credentials from the server.
- The left **navigation sidebar stays fixed** while you scroll movies, series, favorites, and other pages.

---

## Channel groups (organize Live TV)

Your provider ships dozens or hundreds of **channel groups** (Sports, News, 4K, etc.). WebStream lets you customize how those appear **only on your server**—the provider lineup itself does not change.

### What you can change

| Action | Where |
|--------|--------|
| **Rename** a group (display name) | **Channel groups** page, **Rename** on a card, or right-click a group on **Live TV** |
| **Reorder** | Enable **Drag to reorder** on the organizer page, or **Move up / Move down** via right-click on Live TV |
| **Hide / show** | **Hide** on a card, or the **Hidden** tab to restore groups |
| **Reset everything** | **Reset defaults** on the organizer page |

### Organizer page (`/live/categories`)

- **Tabs:** **All**, **Visible** (shown on Live TV), **Hidden**
- **Search** to filter long lists
- **Card grid** with even card widths (sized from the longest title in the current tab)
- **Scrollable** grid area for large libraries
- Changes save automatically to **`data/webstream.json`** under `library.liveCategories` (`order`, `labels`, `hidden`)

Custom group names also appear in **Search** and channel labels where groups are shown.

---

## Movies and series pagination

Large VOD libraries load in the browser once from your provider, then WebStream **pages the UI** so the grid stays fast:

- **25 titles per page** by default
- **Previous / Next** and numbered pages
- **“Showing 1–25 of …”** summary
- Page resets when you change search, category, or sort (Movies)
- Changing pages scrolls the main content back to the top

---

## Recordings (optional)

Live recording saves an MPEG-TS file (`.ts`) on the **WebStream server**, not in your browser.

1. Install **ffmpeg** on the machine (or in your Docker image) where WebStream runs.  
2. In **Settings → Recordings**, set:
   - **Save folder** — absolute path on that machine (e.g. `/app/recordings` in Docker, or `/Users/you/Videos/WebStream` on macOS).  
   - **ffmpeg command** — usually `ffmpeg`.  
3. While watching **live** TV, use **Record** in the player; stop recording from the same control.

Default folder without custom settings:

- **Docker:** `/app/recordings` (volume `webstream-recordings`)  
- **Local run:** `recordings/` in the project directory  

Recording uses stream copy (no re-encode). Playback of recordings inside WebStream is not the main focus yet—files are meant to be opened with VLC or similar.

---

## Logs and troubleshooting

WebStream appends issues to **`data/errors.txt`** on the server (playback hiccups, proxy errors, login failures, etc.). Nothing is uploaded automatically.

- In the app: **Logs & info** explains privacy and shows log file status.  
- On disk: `data/errors.txt` (rotates to `errors.txt.1` when large).  
- Docker:  
  ```bash
  docker exec -it $(docker compose ps -q webstream) cat /app/data/errors.txt
  ```

| Problem | Things to try |
|---------|----------------|
| Login works on provider app but not WebStream | Verify portal URL; check provider IP restrictions |
| Logged in but catalog empty / 401 errors on LAN | Set `SESSION_COOKIE_SECURE=false` for plain `http://` |
| Live won’t play | Provider stream format; check `errors.txt` for proxy/403/410 lines |
| Recording fails | Install ffmpeg; set folder path in Settings; check `errors.txt` |
| Changes after `git pull` | Rebuild Docker: `docker compose up -d --build` |

---

## Where your data is stored

| File / folder | Gitignored | Contents |
|---------------|------------|----------|
| `data/webstream.json` | Yes | Favorites, watch progress, **Live TV group layout** (order, rename, hidden), optional remembered login |
| `data/errors.txt` | Yes | Local diagnostic log |
| `recordings/` or Docker volume | Yes | Live `.ts` recordings |
| `.env` | Yes | `SESSION_SECRET` and related env vars |

Do not commit `.env` or `data/webstream.json` to a public repository.

---

## Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SESSION_SECRET` | **Yes in production** | (dev fallback in code) | Signs session cookies. Use `openssl rand -base64 32`. |
| `SESSION_COOKIE_SECURE` | No | `false` in Compose example | Set `true` when users only access WebStream over **HTTPS**. |
| `PORT` | No | `8080` | HTTP port WebStream listens on. |
| `NODE_ENV` | No | `production` in Docker | `development` enables dev webpack middleware. |
| `WEBSTREAM_RECORDINGS_DIR` | No | `recordings/` or `/app/recordings` | Default recording directory. |
| `WEBSTREAM_FFMPEG` | No | `ffmpeg` | Path to ffmpeg binary. |

For Docker Compose, put these in `.env` next to `docker-compose.yml`.

---

## HTTPS and reverse proxy

For access over the internet, put **Nginx**, **Caddy**, or **Traefik** in front of WebStream, terminate TLS at the proxy, and forward to `http://127.0.0.1:8080`.

Set:

```env
SESSION_COOKIE_SECURE=true
```

Example Nginx location block:

```nginx
location / {
  proxy_pass http://127.0.0.1:8080;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
}
```

WebStream uses the client IP for some stream requests; forwarding `X-Real-IP` / `X-Forwarded-For` helps when you are behind a proxy.

---

## Updating after you pull new code

**Docker:**

```bash
cd WebStream
git pull
docker compose up -d --build
```

**Node (no Docker):**

```bash
git pull
npm install
npm run build
npm start
```

Your data in Docker volumes or local `data/` is kept unless you delete volumes or files manually.

---

## Project structure

```text
WebStream/
  server/              Express API, Xtream client, stream proxy, recording, event log
  src/                 React UI (pages, player, hooks)
  public/              HTML shell for webpack
  data/                Runtime data (created at first run; mostly gitignored)
  recordings/          Default local recording output (gitignored)
  docker-compose.yml   One-service Compose file
  Dockerfile           Multi-stage build (webpack + Node runtime)
  webpack.config.cjs   Frontend bundle config
  .env.example         Template for secrets and cookie settings
```

**Stack:** React 19, React Router, webpack, Express, express-session, hls.js, react-paginate, react-tabs, @dnd-kit (drag reorder for channel groups).

**UI libraries (selected):** [react-paginate](https://github.com/AdeleD/react-paginate) for Movies/Series pages; [react-tabs](https://github.com/reactjs/react-tabs) for group organizer tabs; [@dnd-kit](https://dndkit.com) for reordering groups.

---

## Disclaimer

WebStream is a **player interface** only. You are responsible for complying with your IPTV provider’s terms of service and applicable laws in your region. The authors do not provide streams, subscriptions, or hosted content.

---

## License

MIT
