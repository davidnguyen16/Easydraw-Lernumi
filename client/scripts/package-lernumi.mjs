/**
 * Zip `dist-lernumi/` into a Lernumi tool package.
 *
 * Run after `npm run build:lernumi`. The archive lands in `artifacts/` and is
 * what you upload under Admin → Tools → EasyDraw → New version. `tool.json`
 * must sit at the ZIP root with `entry` pointing at an existing HTML file —
 * Lernumi rejects the upload otherwise, so this checks both before zipping.
 */
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { zipSync } from 'fflate';

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distRoot = path.join(clientRoot, 'dist-lernumi');
const artifactRoot = path.join(clientRoot, 'artifacts');

async function collect(directory, prefix = '') {
  const result = {};
  for (const name of await readdir(directory)) {
    const absolute = path.join(directory, name);
    const relative = path.posix.join(prefix, name);
    const info = await stat(absolute);
    if (info.isDirectory()) Object.assign(result, await collect(absolute, relative));
    else result[relative] = new Uint8Array(await readFile(absolute));
  }
  return result;
}

const files = await collect(distRoot);
// Vite copies only referenced assets and publicDir; the manifest is added by hand.
files['tool.json'] = new Uint8Array(await readFile(path.join(clientRoot, 'lernumi', 'tool.json')));
const manifest = JSON.parse(new TextDecoder().decode(files['tool.json']));
if (typeof manifest.version !== 'string' || !manifest.version) {
  throw new Error('tool.json must contain a version');
}
if (!files[manifest.entry]) {
  throw new Error(`tool.json entry "${manifest.entry}" is not in the build output`);
}

await mkdir(artifactRoot, { recursive: true });
const output = path.join(artifactRoot, `easydraw-${manifest.version}.zip`);
const zip = zipSync(files, { level: 9 });
await writeFile(output, zip);

const unpacked = Object.values(files).reduce((total, bytes) => total + bytes.byteLength, 0);
console.log(
  JSON.stringify(
    { output, files: Object.keys(files).length, compressed: zip.byteLength, unpacked },
    null,
    2,
  ),
);
