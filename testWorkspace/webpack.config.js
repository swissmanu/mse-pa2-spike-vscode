const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");

module.exports = {
  entry: "./src/browser.ts",
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "bundle.js",
  },
  resolve: {
    extensions: [".ts", ".js"],
  },
  devtool: 'source-map',
  module: {
    rules: [{ test: /.ts$/, loader: "ts-loader" }],
  },
  plugins: [
    new HtmlWebpackPlugin({
      title: "vscode Spike",
    }),
  ],
};
