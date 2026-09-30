const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");

const isProd = process.env.NODE_ENV === "production";

module.exports = {
  entry: path.resolve(__dirname, "src/index.jsx"),
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: isProd ? "assets/[name].[contenthash:8].js" : "assets/[name].js",
    publicPath: "/",
    clean: isProd,
  },
  resolve: {
    extensions: [".js", ".jsx"],
  },
  module: {
    rules: [
      {
        test: /\.jsx?$/,
        exclude: /node_modules/,
        use: { loader: "babel-loader" },
      },
      {
        test: /\.css$/,
        use: ["style-loader", "css-loader"],
      },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: path.resolve(__dirname, "public/index.html"),
      favicon: path.resolve(__dirname, "public/favicon.svg"),
    }),
  ],
  devtool: isProd ? "source-map" : "eval-source-map",
  mode: isProd ? "production" : "development",
  optimization: {
    splitChunks: {
      chunks: "all",
      cacheGroups: {
        vendor: {
          test: /[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom)[\\/]/,
          name: "vendor",
          priority: 20,
        },
      },
    },
    runtimeChunk: "single",
  },
  performance: {
    hints: isProd ? "warning" : false,
    maxEntrypointSize: 512000,
    maxAssetSize: 512000,
  },
};
