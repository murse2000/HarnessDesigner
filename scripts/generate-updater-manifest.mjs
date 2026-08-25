import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const [assetsDirectory, repository, tag, version] = process.argv.slice(2);
if (!assetsDirectory || !repository || !tag || !version) {
  throw new Error("사용법: node scripts/generate-updater-manifest.mjs <assets> <owner/repo> <tag> <version>");
}

const assets = {
  "darwin-aarch64": `Harness-Designer_${version}_macos-arm64.app.tar.gz`,
  "darwin-x86_64": `Harness-Designer_${version}_macos-x64.app.tar.gz`,
  "windows-x86_64": `Harness-Designer_${version}_windows-x64_setup.exe`,
  "linux-x86_64": `Harness-Designer_${version}_linux-x64.AppImage`,
};
const platforms = {};
for (const [platform, asset] of Object.entries(assets)) {
  platforms[platform] = {
    signature: (await readFile(join(assetsDirectory, `${asset}.sig`), "utf8")).trim(),
    url: `https://github.com/${repository}/releases/download/${tag}/${asset}`,
  };
}

await writeFile(join(assetsDirectory, "latest.json"), `${JSON.stringify({
  version,
  notes: `Harness Designer ${tag}`,
  pub_date: new Date().toISOString(),
  platforms,
}, null, 2)}\n`);
