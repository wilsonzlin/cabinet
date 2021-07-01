const esbuild = require("esbuild");
const minifyHtml = require("@minify-html/core");
const fs = require("fs");
const path = require("path");

const build = (module.exports.build = (debug) => {
  fs.rmSync(path.join(__dirname, "dist"), { recursive: true, force: true });
  fs.mkdirSync(path.join(__dirname, "dist"));
  const minifyCfg = minifyHtml.createConfiguration({});
  const htmlTemplate = fs.readFileSync(
    path.join(__dirname, "src", "client", "index.html"),
    "utf8"
  );
  const { outputFiles } = esbuild.buildSync({
    bundle: true,
    define: {
      "process.env.NODE_ENV": JSON.stringify(
        debug ? "development" : "production"
      ),
    },
    entryPoints: ["src/client/index.tsx"],
    legalComments: "none",
    minify: !debug,
    outdir: "dist",
    write: false,
  });
  const js = outputFiles.find((f) => f.path.endsWith("index.js")).text;
  const css = outputFiles.find((f) => f.path.endsWith("index.css")).text;
  const html = htmlTemplate.replace(
    "</body>",
    `
  <style>${css}</style>
  <script>${js}</script>
</body>
`
  );
  esbuild.buildSync({
    bundle: true,
    define: {
      "process.env.NODE_ENV": JSON.stringify(
        debug ? "development" : "production"
      ),
      CLIENT_HTML: JSON.stringify(
        minifyHtml.minify(html, minifyCfg).toString()
      ),
    },
    entryPoints: ["src/main.ts"],
    external: Object.keys(require("./package.json").dependencies),
    minify: !debug,
    outdir: "dist",
    platform: "node",
    write: true,
  });
  fs.chmodSync(path.join(__dirname, "dist", "main.js"), 0b101_101_101);
});

if (require.main == module) {
  build();
}
