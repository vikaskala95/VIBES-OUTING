const path = require('path');
const fs = require('fs');
const esbuild = require('esbuild');

const outdir = path.join(__dirname, '..', 'public', 'app', 'assets');

async function build() {
  await esbuild.build({
    entryPoints: [path.join(__dirname, '..', 'src', 'main.js'), path.join(__dirname, '..', 'src', 'styles.css')],
    bundle: true,
    splitting: true,
    format: 'esm',
    outdir,
    minify: true,
    sourcemap: false,
    target: ['es2020'],
  });

  const files = fs.readdirSync(outdir).filter((name) => name.endsWith('.js'));
  const totalJsBytes = files.reduce((sum, fileName) => {
    const full = path.join(outdir, fileName);
    return sum + fs.statSync(full).size;
  }, 0);

  const kb = totalJsBytes / 1024;
  console.log(`Frontend JS bundle size: ${kb.toFixed(2)} KB`);

  if (totalJsBytes > 250 * 1024) {
    throw new Error(`Initial JS bundle exceeded 250KB target: ${kb.toFixed(2)} KB`);
  }
}

build().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
