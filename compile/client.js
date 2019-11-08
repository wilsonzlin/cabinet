const babel = require('@babel/core');
const cleanCss = require('clean-css');
const mkdirp = require('mkdirp');
const terser = require('terser');
const {dirname, join} = require('path');
const {readdirSync, readFileSync, writeFileSync} = require('fs');

const PROJECT_DIR = join(__dirname, '..');
const SRC_DIR = join(PROJECT_DIR, 'src');
const SRC_CLIENT_DIR = join(SRC_DIR, 'client');
const BUILD_DIR = join(PROJECT_DIR, 'build');
const BUILD_CLIENT_DIR = join(BUILD_DIR, 'client');

const conditionalLog = msg => {
  if (Array.isArray(msg)) {
    for (const m of msg) {
      conditionalLog(m);
    }
  } else if (msg) {
    console.error(msg);
  }
};

for (const component of readdirSync(SRC_CLIENT_DIR)) {
  for (const file of readdirSync(join(SRC_CLIENT_DIR, component))) {
    const raw = readFileSync(join(SRC_CLIENT_DIR, component, file), 'utf8');
    const dest = join(BUILD_CLIENT_DIR, component, file);
    const destCompat = join(BUILD_CLIENT_DIR, component, `${file}.compat`);
    console.log(`Processing ${component}/${file}...`);

    let compiled;
    let compiledCompat;

    if (file.endsWith('.min.js')) {
      compiled = raw;

    } else if (file.endsWith('.js')) {
      const minify = terser.minify(raw, {
        warnings: true,
      });
      conditionalLog(minify.warnings);
      conditionalLog(minify.error);
      compiled = minify.code;

      const transpileCompat = babel.transformSync(raw, {
        presets: ['@babel/preset-env'],
      });
      const minifyCompat = terser.minify(transpileCompat.code, {
        warnings: true,
      });
      conditionalLog(minifyCompat.warnings);
      conditionalLog(minifyCompat.error);
      compiledCompat = minifyCompat.code;

    } else if (file.endsWith('.css')) {
      const result = new cleanCss({
        level: 2,
      }).minify(raw);
      conditionalLog(result.errors);
      conditionalLog(result.warnings);
      compiled = result.styles;

    } else {
      compiled = raw;
    }

    mkdirp.sync(dirname(dest));
    writeFileSync(dest, compiled);
    if (compiledCompat !== undefined) {
      writeFileSync(destCompat, compiledCompat);
    }
  }
}
