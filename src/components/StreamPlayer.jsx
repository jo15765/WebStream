import { useEffect, useMemo, useRef, useState } from "react";
import {
  ensurePlaybackClientIp,
  fetchActiveRecording,
  livePlayCandidates,
  prefetchLiveManifest,
  startRecording,
  stopRecording,
  streamSegmentUsesCredentials,
} from "../api/http.js";
import { createWebStreamHlsLoader } from "../player/hlsLiveLoader.js";
import {
  reportClientDiagnostic,
  reportPlaybackError,
  reportPlaybackHiccup,
} from "../diagnostics/clientLog.js";

function isHlsSource(url) {
  return /\.m3u8(\?|$)/i.test(url) || /[?&]ext=m3u8/i.test(url);
}

function isMpegTsSource(url) {
  return /[?&]ext=ts/i.test(url) || /\.ts(\?|$)/i.test(url);
}

function candidatesFromSrc(src, channelHint) {
  if (channelHint) {
    const fromChannel = livePlayCandidates(channelHint);
    if (fromChannel.length) return fromChannel;
  }
  if (src.includes("/api/play-remote")) return [src];
  const match = src.match(/\/api\/play\/live\/([^/?]+)/);
  if (!match) return [src];
  const id = match[1];
  return ["m3u8", "mp4"].map(
    (ext) => `/api/play/live/${id}?ext=${encodeURIComponent(ext)}`,
  );
}

function absoluteMediaUrl(url) {
  const s = String(url || "").trim();
  if (!s) return s;
  if (/^https?:\/\//i.test(s)) return s;
  return new URL(s, window.location.origin).href;
}

function logPlayer(level, ...args) {
  const fn = console[level] || console.log;
  fn("[WebStream player]", ...args);
  const parts = args.map((a) => {
    if (a == null) return "";
    if (typeof a === "object") {
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    }
    return String(a);
  });
  const message = parts.filter(Boolean).join(" ");
  const lastObj = [...args].reverse().find((a) => a && typeof a === "object");
  if (level === "error") {
    reportPlaybackError(message.slice(0, 480), lastObj);
  } else if (level === "warn") {
    reportClientDiagnostic("playback", "warn", message.slice(0, 480), lastObj, 2000);
  } else if (level === "debug" && /kick loader|watchdog|unexpected pause|buffer-stalled|stream sync|Timed out/i.test(message)) {
    reportPlaybackHiccup(message.slice(0, 480), lastObj);
  }
}

function formatLabel(url) {
  if (/ext=m3u8/i.test(url)) return "HLS (.m3u8)";
  if (/ext=ts/i.test(url)) return "MPEG-TS (.ts)";
  if (/ext=mp4/i.test(url)) return "MP4";
  if (url.includes("play-remote")) return "direct";
  return "stream";
}

const IS_DEV = process.env.NODE_ENV !== "production";

function bufferAheadSeconds(video) {
  if (!video?.buffered?.length) return 0;
  const t = video.currentTime;
  for (let i = 0; i < video.buffered.length; i += 1) {
    if (t >= video.buffered.start(i) && t <= video.buffered.end(i)) {
      return Math.max(0, video.buffered.end(i) - t);
    }
  }
  const end = video.buffered.end(video.buffered.length - 1);
  return Math.max(0, end - t);
}

function formatDevLagSeconds(value) {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toFixed(1);
}

export function StreamPlayer({
  title,
  programTitle,
  programTime,
  src,
  channel,
  onClose,
  initialTime = 0,
  onProgress,
  poster,
}) {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const mpegtsRef = useRef(null);
  const tryNextRef = useRef(null);
  const userPausedRef = useRef(false);

  const candidates = useMemo(
    () => candidatesFromSrc(src, channel),
    [src, channel],
  );

  const [attempt, setAttempt] = useState(0);
  const [levels, setLevels] = useState([]);
  const [levelIndex, setLevelIndex] = useState(-1);
  const [booting, setBooting] = useState(true);
  const [devLiveStats, setDevLiveStats] = useState(null);
  const [recording, setRecording] = useState(null);
  const [recordBusy, setRecordBusy] = useState(false);

  const activeSrc = candidates[attempt] ?? null;
  const canRecord = Boolean(
    channel && activeSrc && /\/api\/play\/live\//.test(activeSrc),
  );
  const streamId = channel?.stream_id ?? channel?.id ?? channel?.num ?? null;

  useEffect(() => {
    setAttempt(0);
    userPausedRef.current = false;
    setRecording(null);
  }, [src, channel]);

  useEffect(() => {
    if (!canRecord) {
      setRecording(null);
      return;
    }
    let cancelled = false;
    fetchActiveRecording()
      .then((data) => {
        if (!cancelled) setRecording(data?.active ?? null);
      })
      .catch(() => {
        if (!cancelled) setRecording(null);
      });
    return () => {
      cancelled = true;
    };
  }, [canRecord, streamId]);

  async function toggleRecording() {
    if (!canRecord || !streamId || recordBusy) return;
    setRecordBusy(true);
    try {
      if (recording?.id) {
        const result = await stopRecording(recording.id);
        setRecording(null);
        logPlayer("info", "Recording saved", result.filePath || result.filename);
      } else {
        const result = await startRecording({
          kind: "live",
          streamId: String(streamId),
          title: title || "Live",
        });
        setRecording({
          id: result.id,
          filename: result.filename,
          filePath: result.filePath,
          startedAt: Date.now(),
        });
        logPlayer("info", "Recording", result.filePath || result.filename);
      }
    } catch (e) {
      logPlayer("error", e.message || "Recording failed");
    } finally {
      setRecordBusy(false);
    }
  }

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !activeSrc) {
      logPlayer("error", "Missing playback URL for this channel.");
      setBooting(false);
      return;
    }

    let cancelled = false;
    let hls;
    let mpegtsPlayer;
    let streamSyncDebounce = null;
    let resumePlaybackHandler = null;
    let keepAliveInterval = null;
    let lastPlaybackTime = -1;
    let lastPlaybackAdvanceAt = Date.now();
    let pauseResumeTimer = null;
    let onTimeAdvance = null;
    let onPauseGuard = null;
    let bootTimeoutId = null;
    let playbackReady = false;

    userPausedRef.current = false;

    function markPlaybackReady() {
      playbackReady = true;
      if (bootTimeoutId != null) {
        clearTimeout(bootTimeoutId);
        bootTimeoutId = null;
      }
    }

    const tryNext = (reason) => {
      if (cancelled) return;
      if (attempt + 1 < candidates.length) {
        logPlayer("info", reason || "Trying next format", formatLabel(candidates[attempt + 1]));
        setAttempt((i) => i + 1);
        return;
      }
      logPlayer("error", "All playback formats failed for this channel.");
      setBooting(false);
    };
    tryNextRef.current = tryNext;

    async function attachHls(url) {
      const manifestUrl = url;
      if (cancelled) return false;

      function markPlaybackAdvance() {
        const t = video.currentTime;
        if (Number.isFinite(t) && t !== lastPlaybackTime) {
          lastPlaybackTime = t;
          lastPlaybackAdvanceAt = Date.now();
        }
      }

      const canNative = video.canPlayType("application/vnd.apple.mpegurl");
      if (canNative) {
        video.src = manifestUrl;
        setBooting(false);
        markPlaybackReady();
        lastPlaybackAdvanceAt = Date.now();
        onTimeAdvance = () => markPlaybackAdvance();
        onPauseGuard = () => {
          if (cancelled || userPausedRef.current) return;
          if (pauseResumeTimer) clearTimeout(pauseResumeTimer);
          pauseResumeTimer = window.setTimeout(() => {
            pauseResumeTimer = null;
            if (!cancelled && !userPausedRef.current && video.paused) {
              video.play().catch((e) => logPlayer("debug", "native play resume", e?.message || e));
            }
          }, 50);
        };
        video.addEventListener("timeupdate", onTimeAdvance);
        video.addEventListener("pause", onPauseGuard);
        keepAliveInterval = window.setInterval(() => {
          if (userPausedRef.current || cancelled) return;
          if (video.paused) {
            video.play().catch((e) => logPlayer("debug", "native keep-alive", e?.message || e));
          }
        }, 400);
        video.play().catch((e) => logPlayer("debug", "native HLS play", e?.message || e));
        return true;
      }

      const { default: Hls } = await import("hls.js");
      if (cancelled) return false;
      if (!Hls.isSupported()) return false;

      const liveManifestBase = manifestUrl;

      function resumePlayback() {
        if (cancelled || !video || video.ended || userPausedRef.current) return;
        if (video.paused) {
          video.play().catch((e) => logPlayer("debug", "play resume", e?.message || e));
        }
      }

      function kickLiveLoader(reason) {
        if (cancelled || !hls) return;
        const buf = bufferAheadSeconds(video);
        const stalledMs = Date.now() - lastPlaybackAdvanceAt;
        if (buf >= 4 && stalledMs < 3000) return;
        logPlayer("debug", "kick loader", reason, { buf: buf.toFixed(1), stalledMs });
        hls.startLoad(-1);
      }

      function ensureLivePlayback(reason) {
        if (cancelled || !video || video.ended || userPausedRef.current) return;
        markPlaybackAdvance();
        resumePlayback();
        kickLiveLoader(reason);
      }

      function softStreamSync(reason) {
        if (cancelled || !hls) return;
        if (reason) logPlayer("debug", "stream sync", reason);
        prefetchLiveManifest(liveManifestBase).finally(() => {
          if (cancelled || !hls) return;
          hls.startLoad(-1);
          ensureLivePlayback("after-sync");
        });
      }

      function scheduleStreamSync(reason) {
        if (streamSyncDebounce) return;
        streamSyncDebounce = window.setTimeout(() => {
          streamSyncDebounce = null;
          softStreamSync(reason);
        }, 350);
      }

      function startLiveKeepAlive() {
        onTimeAdvance = () => markPlaybackAdvance();
        onPauseGuard = () => {
          if (cancelled || userPausedRef.current) return;
          if (pauseResumeTimer) clearTimeout(pauseResumeTimer);
          pauseResumeTimer = window.setTimeout(() => {
            pauseResumeTimer = null;
            if (!cancelled && !userPausedRef.current && video.paused) {
              logPlayer("debug", "unexpected pause — resuming");
              ensureLivePlayback("pause-guard");
            }
          }, 50);
        };
        video.addEventListener("timeupdate", onTimeAdvance);
        video.addEventListener("playing", markPlaybackAdvance);
        video.addEventListener("pause", onPauseGuard);
        keepAliveInterval = window.setInterval(() => {
          if (userPausedRef.current) return;
          const stalledMs = Date.now() - lastPlaybackAdvanceAt;
          const buf = bufferAheadSeconds(video);
          if (video.paused) {
            ensureLivePlayback("watchdog-paused");
            return;
          }
          if (stalledMs > 2000 || buf < 2.5) {
            ensureLivePlayback("watchdog-stall");
          }
        }, 400);
      }

          hls = new Hls({
            debug: false,
            loader: createWebStreamHlsLoader(Hls),
            enableWorker: true,
            lowLatencyMode: false,
            startFragPrefetch: true,
            maxBufferLength: 120,
            maxMaxBufferLength: 240,
            maxBufferSize: 120 * 1000 * 1000,
            backBufferLength: 60,
            liveBackBufferLength: 120,
            liveSyncMode: "buffered",
            liveSyncDuration: 36,
            liveMaxLatencyDuration: 180,
            maxLiveSyncPlaybackRate: 1.05,
            maxStarvationDelay: 30,
            maxLoadingDelay: 20,
            maxBufferHole: 0.5,
            highBufferWatchdogPeriod: 3,
            nudgeMaxRetry: 12,
            manifestLoadingMaxRetry: 10,
            levelLoadingMaxRetry: 10,
            fragLoadingMaxRetry: 14,
            manifestLoadPolicy: {
              default: {
                maxTimeToFirstByteMs: 15000,
                maxLoadTimeMs: 30000,
                timeoutRetry: { maxNumRetry: 6, retryDelayMs: 500, maxRetryDelayMs: 4000 },
                errorRetry: { maxNumRetry: 6, retryDelayMs: 500, maxRetryDelayMs: 4000 },
              },
            },
            fragLoadPolicy: {
              default: {
                maxTimeToFirstByteMs: 20000,
                maxLoadTimeMs: 45000,
                timeoutRetry: { maxNumRetry: 8, retryDelayMs: 400, maxRetryDelayMs: 6000 },
                errorRetry: { maxNumRetry: 10, retryDelayMs: 400, maxRetryDelayMs: 8000 },
              },
            },
            fetchSetup(context, initParams) {
              const url = String(context.url || "");
              const headers = new Headers(initParams.headers || {});
              if (!url.includes("/api/proxy/h/")) {
                headers.delete("Range");
              }
              const sameOrigin = url.includes("/api/");
              return new Request(context.url, {
                ...initParams,
                headers,
                credentials: sameOrigin ? "include" : "omit",
                mode: "cors",
              });
            },
            xhrSetup(xhr, reqUrl) {
              xhr.withCredentials = streamSegmentUsesCredentials(reqUrl);
            },
          });
      hls.loadSource(manifestUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, (_e, payload) => {
        setLevels(payload.levels || []);
        setBooting(false);
        markPlaybackReady();
        lastPlaybackAdvanceAt = Date.now();
        startLiveKeepAlive();
        video.play().catch((e) => logPlayer("debug", "initial play", e?.message || e));
      });
      hls.on(Hls.Events.FRAG_BUFFERED, () => {
        markPlaybackAdvance();
        ensureLivePlayback("frag-buffered");
      });
      hls.on(Hls.Events.ERROR, (_e, data) => {
        const code = data.response?.code;
        const body = data.response?.text || "";
        logPlayer("warn", data.details || data.type, code || "", body.slice(0, 80));

        if (data.details === Hls.ErrorDetails.BUFFER_STALLED_ERROR) {
          kickLiveLoader("buffer-stalled");
          ensureLivePlayback("buffer-stalled");
          return;
        }

        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          if (data.details === Hls.ErrorDetails.FRAG_LOAD_ERROR) {
            if (code === 410 || code === 403 || code === 502 || code === 0) {
              scheduleStreamSync(code ? `HTTP ${code}` : "segment");
              if (!data.fatal) return;
            }
          }
          if (data.fatal) {
            scheduleStreamSync("network");
            return;
          }
        }

        if (
          data.type === Hls.ErrorTypes.NETWORK_ERROR &&
          data.details === Hls.ErrorDetails.FRAG_LOAD_ERROR &&
          code === 403 &&
          /wrong server/i.test(body)
        ) {
          scheduleStreamSync("wrong server");
          return;
        }

        if (data.type === Hls.ErrorTypes.MEDIA_ERROR && data.fatal) {
          if (hls.recoverMediaError()) return;
        }

        if (data.fatal) {
          hls?.destroy();
          hls = null;
          tryNext("HLS failed.");
        }
      });

      resumePlaybackHandler = () => ensureLivePlayback("waiting");
      video.addEventListener("waiting", resumePlaybackHandler);
      video.addEventListener("stalled", resumePlaybackHandler);

      hlsRef.current = hls;
      return true;
    }

    async function attachMpegTs(url) {
      if (cancelled) return false;
      const streamUrl = absoluteMediaUrl(url);

      const mpegts = await import("mpegts.js");
      if (cancelled) return false;
      if (!mpegts.default.isSupported()) return false;

      mpegtsPlayer = mpegts.default.createPlayer(
        {
          type: "mpegts",
          url: streamUrl,
          isLive: true,
          hasAudio: true,
          hasVideo: true,
        },
        {
          enableWorker: true,
          liveBufferLatencyChasing: true,
          enableStashBuffer: false,
          stashInitialSize: 128,
        },
      );
      mpegtsPlayer.attachMediaElement(video);
      mpegtsPlayer.on(mpegts.default.Events.ERROR, () => {
        mpegtsPlayer?.destroy();
        mpegtsPlayer = null;
        tryNext("TS failed.");
      });
      mpegtsPlayer.on(mpegts.default.Events.MEDIA_INFO, () => {
        setBooting(false);
        markPlaybackReady();
        video.play().catch((e) => logPlayer("debug", "TS play", e?.message || e));
      });
      mpegtsPlayer.load();
      mpegtsRef.current = mpegtsPlayer;
      return true;
    }

    async function attach() {
      setBooting(true);
      setLevels([]);

      video.removeAttribute("src");
      video.load();

      if (activeSrc.includes("/api/play/live/")) {
        try {
          const ip = await ensurePlaybackClientIp();
          logPlayer("debug", "playback client IP", ip);
        } catch (err) {
          logPlayer("error", err.message || "Could not prepare live playback.");
          setBooting(false);
          return;
        }
      }

      if (isHlsSource(activeSrc)) {
        const ok = await attachHls(activeSrc);
        if (ok || cancelled) return;
        tryNext("HLS unavailable.");
        return;
      }

      if (isMpegTsSource(activeSrc)) {
        const ok = await attachMpegTs(activeSrc);
        if (ok || cancelled) return;
        tryNext("TS unavailable.");
        return;
      }

      video.src = activeSrc;
      setBooting(false);
      const onCanPlay = () => {
        markPlaybackReady();
        video.removeEventListener("canplay", onCanPlay);
      };
      video.addEventListener("canplay", onCanPlay);
    }

    attach();

    bootTimeoutId = window.setTimeout(() => {
      if (!cancelled && !playbackReady) tryNext("Timed out.");
    }, 22000);

    const tick = () => {
      if (onProgress && video.duration && !Number.isNaN(video.duration)) {
        onProgress(video.currentTime, video.duration);
      }
    };
    const interval = setInterval(tick, 4000);
    video.addEventListener("timeupdate", tick);

    return () => {
      cancelled = true;
      if (bootTimeoutId != null) clearTimeout(bootTimeoutId);
      clearInterval(interval);
      if (streamSyncDebounce) clearTimeout(streamSyncDebounce);
      if (pauseResumeTimer) clearTimeout(pauseResumeTimer);
      if (keepAliveInterval) clearInterval(keepAliveInterval);
      if (onTimeAdvance) video.removeEventListener("timeupdate", onTimeAdvance);
      if (onPauseGuard) video.removeEventListener("pause", onPauseGuard);
      if (resumePlaybackHandler) {
        video.removeEventListener("waiting", resumePlaybackHandler);
        video.removeEventListener("stalled", resumePlaybackHandler);
      }
      video.removeEventListener("timeupdate", tick);
      if (hls) {
        hls.destroy();
        hlsRef.current = null;
      }
      if (mpegtsPlayer) {
        mpegtsPlayer.destroy();
        mpegtsRef.current = null;
      }
    };
  }, [activeSrc, attempt, candidates.length, initialTime, onProgress]);

  useEffect(() => {
    const hls = hlsRef.current;
    if (!hls) return;
    hls.currentLevel = levelIndex;
  }, [levelIndex]);

  useEffect(() => {
    if (!IS_DEV) return undefined;
    const tick = () => {
      const video = videoRef.current;
      if (!video || booting) {
        setDevLiveStats(null);
        return;
      }
      const hls = hlsRef.current;
      const buf = bufferAheadSeconds(video);
      let lag = null;
      if (hls) {
        lag = hls.latency;
        if ((lag == null || lag === 0) && hls.liveSyncPosition != null) {
          lag = Math.max(0, hls.liveSyncPosition - video.currentTime);
        }
      }
      setDevLiveStats({
        lag,
        buf,
        paused: video.paused,
        rate: video.playbackRate,
      });
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => {
      clearInterval(id);
      setDevLiveStats(null);
    };
  }, [activeSrc, booting]);

  useEffect(() => {
    const onKey = (e) => {
      const v = videoRef.current;
      if (!v) return;
      if (e.key === "Escape") onClose?.();
      if (e.key === " " || e.key === "k") {
        e.preventDefault();
        if (v.paused) {
          userPausedRef.current = false;
          v.play();
        } else {
          userPausedRef.current = true;
          v.pause();
        }
      }
      if (e.key === "f") {
        if (document.fullscreenElement) document.exitFullscreen();
        else v.requestFullscreen?.();
      }
      if (e.key === "ArrowLeft") v.currentTime = Math.max(0, v.currentTime - 10);
      if (e.key === "ArrowRight") v.currentTime = Math.min(v.duration || 0, v.currentTime + 10);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="player-overlay" role="dialog" aria-label={title || "Player"}>
      <div className="player-bar">
        <strong>{title}</strong>
        <div className="player-actions">
          {levels.length > 1 ? (
            <select
              value={levelIndex}
              onChange={(e) => setLevelIndex(Number(e.target.value))}
              aria-label="Quality"
            >
              <option value={-1}>Auto</option>
              {levels.map((lvl, i) => (
                <option key={lvl.height || i} value={i}>
                  {lvl.height ? `${lvl.height}p` : `Level ${i + 1}`}
                </option>
              ))}
            </select>
          ) : null}
          {canRecord ? (
            <button
              type="button"
              className={recording ? "btn record-active" : "btn ghost"}
              disabled={recordBusy || booting}
              onClick={toggleRecording}
              aria-pressed={Boolean(recording)}
            >
              {recordBusy ? "…" : recording ? "Stop rec" : "Record"}
            </button>
          ) : null}
          <button type="button" className="btn ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
      <div className="player-stage">
        {booting ? <div className="player-spinner" aria-hidden /> : null}
        <video
          ref={videoRef}
          className="player-video"
          controls
          playsInline
          crossOrigin="anonymous"
          poster={poster || undefined}
        />
      </div>
      {title || programTitle ? (
        <div className="player-now" aria-live="polite">
          <div className="player-now-copy">
            {title ? <p className="player-now-channel">{title}</p> : null}
            {programTitle ? (
              <p className="player-now-program">
                <span className="player-now-badge">On now</span>
                {programTitle}
                {programTime ? <span className="muted player-now-time">{programTime}</span> : null}
              </p>
            ) : (
              <p className="muted player-now-program">Program guide unavailable</p>
            )}
          </div>
          {IS_DEV && devLiveStats ? (
            <div className="player-dev-stats" title="Dev: live edge lag and buffer">
              <span className="player-dev-lag">
                {formatDevLagSeconds(devLiveStats.lag)}
                <span className="player-dev-unit">s lag</span>
              </span>
              <span className="player-dev-sub muted">
                buf {formatDevLagSeconds(devLiveStats.buf)}s
                {devLiveStats.paused ? " · paused" : ""}
                {devLiveStats.rate !== 1 ? ` · ${devLiveStats.rate.toFixed(2)}×` : ""}
                {recording ? " · REC" : ""}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}
      <p className="player-hint muted">Space/K play · ←/→ seek · F fullscreen · Esc close</p>
    </div>
  );
}
