# WebStream

Self-hosted **Xtream Codes** IPTV player built with **React** (webpack) and **Express**. WebStream is an independent project — similar capabilities to other IPTV front-ends (live TV, VOD, series, EPG, favorites) but implemented with its own UI, routing, and server layout.

WebStream does **not** ship or host content. Connect your own provider credentials.

## Features

- Xtream portal login (credentials stored in server-side session)
- Live TV with categories, filter, and short EPG drawer
- Movies and series libraries with search and sort
- HLS playback via **hls.js** (with quality selection when multi-bitrate)
- Favorites and continue-watching (browser `localStorage`)
- Global search (`⌘K` / `Ctrl+K`)
- Stream and image proxy to avoid browser CORS issues

## Stack

| Layer    | Choice                          |
| -------- | ------------------------------- |
| UI       | React 19, React Router          |
| Bundler  | **webpack** (not Vite)          |
| Server   | Express + express-session       |
| Playback | hls.js + native HLS where supported |

## Local development

```bash
cd ~/Downloads/WebStream
cp .env.example .env   # set SESSION_SECRET
npm install
npm run dev
```

- Dev server (API + webpack hot rebuild): [http://localhost:8080](http://localhost:8080)

Open **8080** in the browser, enter your portal URL, username, and password.

### Production build (without Docker)

```bash
npm install
npm run build
SESSION_SECRET="your-secret" npm start
```

App is served on port **8080** (API + static `dist/`).

## Docker

### Quick start with Compose

```bash
cd ~/Downloads/WebStream
cp .env.example .env
# Edit .env and set SESSION_SECRET (required)
docker compose up -d --build
```

Open [http://localhost:8080](http://localhost:8080).

### Manual image build

```bash
docker build -t webstream:latest .
docker run -d --name webstream -p 8080:8080 \
  -e SESSION_SECRET="your-long-random-secret" \
  webstream:latest
```

### Environment variables

| Variable                | Required | Description                                      |
| ----------------------- | -------- | ------------------------------------------------ |
| `SESSION_SECRET`        | Yes (prod) | Signs session cookies (`openssl rand -base64 32`) |
| `SESSION_COOKIE_SECURE` | No       | `true` only behind HTTPS; use `false` for LAN HTTP (default in Compose) |
| `PORT`                  | No       | Default `8080`                                   |

Put `SESSION_SECRET` in `.env` for Compose, or pass `-e` to `docker run`.

### HTTPS / reverse proxy

Run WebStream behind Nginx, Caddy, or Traefik on your VPS. Terminate TLS at the proxy and forward to `http://127.0.0.1:8080`. Set `SESSION_COOKIE_SECURE=true` when TLS terminates at the proxy.

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

## Project layout

```
WebStream/
  server/           Express API, Xtream client, stream proxy
  src/              React application
  public/           HTML template
  webpack.config.cjs
  Dockerfile
  docker-compose.yml
```

## Disclaimer

WebStream is a player interface only. You are responsible for complying with your provider’s terms and applicable law.

## License

MIT
