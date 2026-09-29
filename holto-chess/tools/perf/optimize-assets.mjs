// Builds the runtime media in public/assets from the full-resolution originals in asset-source/.
//
//   node tools/perf/optimize-assets.mjs                 # images only (sharp is a project dependency)
//   LAMEJS_MODULE=<path>/@breezystack/lamejs/dist/lamejs.js node tools/perf/optimize-assets.mjs --audio
//
// Settings are per asset, chosen from measured size/quality trade-offs (see product_doc/qa/2026-09-30-asset-optimization.md):
// - ability icons: shown at most ~173 CSS px (54% of a 320px card) → 512px covers DPR 3; alpha kept.
// - ability frame: card is at most 320 CSS px wide → 960×1440 covers DPR 3; opaque.
// - fullscreen arenas keep their native 1672×941 / 941×1672 framing; higher quality against banding in dark gradients.
// - guide thumbnails: 64 CSS px → 192px.
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const src = path.resolve("asset-source");
const dst = path.resolve("public/assets");
const ABILITIES = ["royal-blood", "target-sniper", "underdog", "first-class", "golden-hand", "trader", "predator", "architect", "capitalism", "zero-risk", "quad-core", "front-runner"];

const jobs = [
  ...ABILITIES.map((id) => ({ from: `abilities/${id}.png`, to: `abilities/${id}.webp`, resize: [512, 512], webp: { quality: 90, alphaQuality: 95, smartSubsample: true } })),
  ...ABILITIES.map((id) => ({ from: `abilities/${id}.png`, to: `abilities/guide/${id}.webp`, resize: [192, 192], webp: { quality: 82 } })),
  { from: "abilities/platinum-frame-aligned.png", to: "abilities/platinum-frame.webp", resize: [960, 1440], webp: { quality: 88, smartSubsample: true } },
  ...["table/match-arena-pc", "table/match-arena-mobile", "final/final-arena-landscape", "final/final-arena-portrait"]
    .map((name) => ({ from: `${name}.png`, to: `${name}.webp`, webp: { quality: 92, smartSubsample: true } })),
];

async function images() {
  for (const job of jobs) {
    let pipeline = sharp(path.join(src, job.from));
    if (job.resize) pipeline = pipeline.resize(job.resize[0], job.resize[1], { kernel: "lanczos3", fit: "fill" });
    fs.mkdirSync(path.dirname(path.join(dst, job.to)), { recursive: true });
    const info = await pipeline.webp({ effort: 6, ...job.webp }).toFile(path.join(dst, job.to));
    console.log(`${job.to.padEnd(36)} ${info.width}×${info.height} ${(info.size / 1024).toFixed(1)} KB (source ${(fs.statSync(path.join(src, job.from)).size / 1024).toFixed(0)} KB)`);
  }
}

/** 16-bit PCM WAV → MP3. decodeAudioData reads MP3 in every supported browser; Ogg/Opus is not safe on older Safari. */
async function audio() {
  const { Mp3Encoder } = await import(new URL(`file:///${path.resolve(process.env.LAMEJS_MODULE).replace(/\\/g, "/")}`).href);
  fs.mkdirSync(path.join(dst, "audio"), { recursive: true });
  for (const file of fs.readdirSync(path.join(src, "audio")).filter((name) => name.endsWith(".wav"))) {
    const wav = fs.readFileSync(path.join(src, "audio", file));
    const channels = wav.readUInt16LE(22); const rate = wav.readUInt32LE(24); const bits = wav.readUInt16LE(34);
    if (channels !== 1 || bits !== 16) throw new Error(`${file}: expected 16-bit mono PCM`);
    let offset = 12; while (wav.toString("ascii", offset, offset + 4) !== "data") offset += 8 + wav.readUInt32LE(offset + 4);
    const samples = new Int16Array(wav.buffer.slice(wav.byteOffset + offset + 8, wav.byteOffset + offset + 8 + wav.readUInt32LE(offset + 4)));
    const encoder = new Mp3Encoder(1, rate, 128); const chunks = [];
    for (let i = 0; i < samples.length; i += 1152) chunks.push(encoder.encodeBuffer(samples.subarray(i, i + 1152)));
    chunks.push(encoder.flush());
    const out = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength)));
    fs.writeFileSync(path.join(dst, "audio", file.replace(/\.wav$/, ".mp3")), out);
    console.log(`audio/${file.replace(/\.wav$/, ".mp3").padEnd(30)} ${(samples.length / rate).toFixed(2)}s ${(out.length / 1024).toFixed(1)} KB (source ${(wav.length / 1024).toFixed(0)} KB)`);
  }
}

if (!process.argv.includes("--audio-only")) await images();
if (process.argv.includes("--audio") || process.argv.includes("--audio-only")) await audio();
