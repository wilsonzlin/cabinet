const { spawn } = require("child_process");
const chokidar = require("chokidar");
const { join } = require("path");
const { build } = require("./build");

let proc;
let procDebounce;
chokidar.watch(join(__dirname, "src")).on("all", (event, path) => {
  proc?.kill();
  console.log(event, path);
  try {
    build(process.env["CABINET_BUILD_DEBUG"] === "1");
  } catch (e) {
    return console.error(e);
  }
  clearTimeout(procDebounce);
  procDebounce = setTimeout(() => {
    console.log("Starting server...");
    proc = spawn(join(__dirname, "dist", "main.js"), process.argv.slice(2), {
      stdio: ["ignore", "inherit", "inherit"],
    });
  }, 400);
});
