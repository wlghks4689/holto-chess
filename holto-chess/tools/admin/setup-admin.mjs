#!/usr/bin/env node
// Sets the admin inbox login (admin.porena.kr).
//   node tools/admin/setup-admin.mjs          -> stores the secrets on the deployed Worker (wrangler secret bulk)
//   node tools/admin/setup-admin.mjs --local  -> writes them to .dev.vars for `npm run dev`
// The password is typed here, hashed with PBKDF2 and never written anywhere in plain text.
// Running it again replaces the account and signs every open admin session out (new session secret).
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { hashAdminPassword } from "../../worker/adminAuth.ts";

const MIN_PASSWORD = 12;
const root = fileURLToPath(new URL("../../", import.meta.url));
const local = process.argv.includes("--local");

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) rl._writeToOutput = (text) => { if (text.includes(question)) process.stdout.write(text); };
    rl.question(question, (answer) => { rl.close(); if (hidden) process.stdout.write("\n"); resolve(answer); });
  });
}

const username = (await ask("관리자 아이디: ")).trim();
if (!/^[A-Za-z0-9._-]{3,32}$/.test(username)) { console.error("아이디는 영문·숫자·._- 3~32자로 입력하세요."); process.exit(1); }
const password = await ask(`비밀번호 (${MIN_PASSWORD}자 이상, 화면에 표시되지 않음): `, { hidden: true });
if (password.length < MIN_PASSWORD) { console.error(`비밀번호는 ${MIN_PASSWORD}자 이상이어야 합니다.`); process.exit(1); }
if (password !== await ask("비밀번호 확인: ", { hidden: true })) { console.error("비밀번호가 일치하지 않습니다."); process.exit(1); }

const secrets = {
  ADMIN_USERNAME: username,
  ADMIN_PASSWORD_HASH: await hashAdminPassword(password),
  ADMIN_SESSION_SECRET: Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url"),
};

if (local) {
  const file = `${root}.dev.vars`;
  const kept = existsSync(file) ? readFileSync(file, "utf8").split(/\r?\n/).filter((line) => line && !Object.keys(secrets).some((name) => line.startsWith(`${name}=`))) : [];
  writeFileSync(file, [...kept, ...Object.entries(secrets).map(([name, value]) => `${name}=${JSON.stringify(value)}`)].join("\n") + "\n");
  console.log(".dev.vars에 관리자 계정을 저장했습니다. 개발 서버를 다시 시작하세요.");
} else {
  const result = spawnSync("npx", ["wrangler", "secret", "bulk"], { cwd: root, input: JSON.stringify(secrets), stdio: ["pipe", "inherit", "inherit"], shell: process.platform === "win32" });
  if (result.status !== 0) { console.error("Cloudflare에 저장하지 못했습니다. `npx wrangler login` 상태를 확인하세요."); process.exit(result.status ?? 1); }
  console.log("운영 Worker에 관리자 계정을 저장했습니다. 기존 관리자 세션은 모두 로그아웃됩니다.");
}
