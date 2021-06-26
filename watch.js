const { spawn } = require("child_process");
const chokidar = require("chokidar");
const { join } = require("path");
const { build } = require("./build");

let proc;
chokidar.watch(join(__dirname, "src")).on("all", (event, path) => {
  proc?.kill();
  console.log(event, path);
  try {
    build();
  } catch (e) {
    return console.error(e);
  }
  proc = spawn(
    join(__dirname, "dist", "main.js"),
    ["--library", "src", "--state", "state", "server", "--port", "3003"],
    {
      cwd: join(__dirname, ".dev-data"),
      stdio: ["ignore", "inherit", "inherit"],
    }
  );
});
