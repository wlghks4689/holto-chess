// IndexNow ownership keys are public proof files, not an account credential.
// Explicit --submit sends only public sitemap URLs. Default is read-only.
import { readFile, readdir } from 'node:fs/promises';
const publicDir = new URL('../../public/', import.meta.url);
const files = (await readdir(publicDir)).filter(name => /^[a-f0-9]{32}\.txt$/.test(name));
if (files.length !== 1) throw new Error('Expected exactly one public IndexNow proof file');
const key = (await readFile(new URL(files[0], publicDir), 'utf8')).trim();
if (`${key}.txt` !== files[0]) throw new Error('Proof file must contain its filename key');
const origin = 'https://porena.kr';
const endpoints = { naver: 'https://searchadvisor.naver.com/indexnow', bing: 'https://www.bing.com/indexnow', global: 'https://api.indexnow.org/indexnow' };
const engine = process.argv.find(arg => arg.startsWith('--engine='))?.slice('--engine='.length) ?? 'naver';
const endpoint = endpoints[engine];
if (!endpoint) throw new Error('Engine must be naver, bing or global');
const keyLocation = `${origin}/${key}.txt`;
async function get(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Public resource not ready: ${url} (${response.status})`);
  return response.text();
}
if ((await get(keyLocation)).trim() !== key) throw new Error('Live ownership proof differs from local proof');
const xml = await get(`${origin}/sitemap.xml`);
const urlList = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
if (!urlList.length || urlList.length > 10000) throw new Error('Invalid sitemap URL count');
for (const item of urlList) {
  const url = new URL(item);
  if (url.origin !== origin || url.search || url.hash) throw new Error('Only canonical public URLs may be submitted');
}
if (!process.argv.includes('--submit')) {
  console.log(JSON.stringify({ mode: 'dry-run', endpoint, urlList }, null, 2));
} else {
  const response = await fetch(endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: 'porena.kr', key, keyLocation, urlList }), signal: AbortSignal.timeout(30000),
  });
  console.log(JSON.stringify({ engine, endpoint, status: response.status, urls: urlList, received: response.status === 200 || response.status === 202, indexingConfirmed: false }, null, 2));
  if (response.status !== 200 && response.status !== 202) throw new Error(`IndexNow submission failed (${response.status})`);
}
