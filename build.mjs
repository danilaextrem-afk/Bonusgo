import {readFile, readdir, writeFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
const names = (await readdir('payload')).sort();
const parts = await Promise.all(names.map(name => readFile('payload/' + name, 'ascii')));
await writeFile('worker.mjs', gunzipSync(Buffer.from(parts.join(''), 'base64')));
