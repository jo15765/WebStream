import { bumpLiveManifestUrl, stripLiveManifestCacheParams } from "../api/http.js";

export function createWebStreamHlsLoader(Hls) {
  const Base = Hls.DefaultConfig.loader;

  return class WebStreamHlsLoader extends Base {
    load(context, config, callbacks) {
      const url = String(context.url || "");
      const isLivePlaylist =
        (context.type === "manifest" || context.type === "level") &&
        url.includes("/api/play/live/");

      if (isLivePlaylist) {
        context.url = bumpLiveManifestUrl(stripLiveManifestCacheParams(url));
      }

      return super.load(context, config, callbacks);
    }
  };
}
