import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import webpack from "webpack";
import webpackDevMiddleware from "webpack-dev-middleware";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.resolve(__dirname, "..", "dist");

export function attachDevAssets(app) {
  const config = require(path.join(__dirname, "..", "webpack.config.cjs"));
  const compiler = webpack({
    ...config,
    mode: "development",
    output: {
      ...config.output,
      clean: false,
    },
  });

  const devMiddleware = webpackDevMiddleware(compiler, {
    publicPath: config.output.publicPath,
    stats: "minimal",
    index: true,
  });

  app.use(devMiddleware);

  app.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    if (req.path.startsWith("/api/")) return next();
    if (req.path.startsWith("/assets/")) return next();

    devMiddleware.waitUntilValid(() => {
      const fs = devMiddleware.context.outputFileSystem;
      const outputPath = compiler.outputPath || distPath;
      const indexPath = path.join(outputPath, "index.html");
      fs.readFile(indexPath, (err, file) => {
        if (err) return next(err);
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.send(file);
      });
    });
  });

  return compiler;
}
