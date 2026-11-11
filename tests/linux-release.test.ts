import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const version = JSON.parse(readFileSync("package.json", "utf8")).version as string;

test("Linux release validation checks package inventory and updater hashes", () => {
	const directory = mkdtempSync(join(tmpdir(), "lh-linux-release-"));
	try {
		const names = ["app.AppImage", "app.deb", "app.rpm", "app.pacman"] as const;
		for (const name of names) writeFileSync(join(directory, name), name);
		const digest = createHash("sha512").update(names[0]).digest("base64");
		writeFileSync(join(directory, "latest-linux.yml"), `version: ${version}\nfiles:\n  - url: ${names[0]}\n    sha512: ${digest}\n    size: ${names[0].length}\n`);
		const verify = () => spawnSync(process.execPath, ["scripts/verify-linux-release.mjs", directory], { encoding: "utf8" });
		assert.equal(verify().status, 0);
		assert.equal(readFileSync(join(directory, "SHA256SUMS"), "utf8").trim().split("\n").length, 5);
		writeFileSync(join(directory, names[0]), "tampered");
		assert.notEqual(verify().status, 0);
		rmSync(join(directory, names[3]));
		assert.match(verify().stderr, /Expected one \.pacman package/);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});
