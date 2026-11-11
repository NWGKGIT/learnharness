import { createHash } from "node:crypto";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const yaml = require("js-yaml");
const directory = process.argv[2];
if (!directory) throw new Error("Usage: node scripts/verify-linux-release.mjs <directory>");
const { version } = JSON.parse(await readFile("package.json", "utf8"));
const names = await readdir(directory);
const packages = [];
for (const extension of [".AppImage", ".deb", ".rpm", ".pacman"]) {
	const matches = names.filter((name) => name.endsWith(extension));
	if (matches.length !== 1) throw new Error(`Expected one ${extension} package, found ${matches.length}`);
	const info = await stat(join(directory, matches[0]));
	if (!info.isFile() || info.size === 0) {
		throw new Error(`Empty or invalid package: ${matches[0]}`);
	}
	packages.push(matches[0]);
}
const feedName = "latest-linux.yml";
const feed = yaml.load(await readFile(join(directory, feedName), "utf8"));
if (!feed || feed.version !== version || !Array.isArray(feed.files) || feed.files.length === 0) {
	throw new Error("Linux update feed has an invalid version or no files");
}
for (const entry of feed.files) {
	if (typeof entry.url !== "string" || basename(entry.url) !== entry.url || !packages.includes(entry.url)) {
		throw new Error(`Update feed references an unexpected file: ${entry.url}`);
	}
	const file = await readFile(join(directory, entry.url));
	if (entry.size !== file.length || entry.sha512 !== createHash("sha512").update(file).digest("base64")) {
		throw new Error(`Update feed checksum or size does not match ${entry.url}`);
	}
}
if (!feed.files.some((entry) => entry.url.endsWith(".AppImage"))) throw new Error("Update feed does not include the AppImage");
const assets = [...packages, feedName];
const checksums = await Promise.all(assets.map(async (name) => {
	const contents = await readFile(join(directory, name));
	return `${createHash("sha256").update(contents).digest("hex")}  ${name}`;
}));
await writeFile(join(directory, "SHA256SUMS"), `${checksums.join("\n")}\n`);
console.log(`Verified ${assets.length} Linux release assets for ${version}`);
