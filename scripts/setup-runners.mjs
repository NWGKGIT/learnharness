import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

// Run after pulling/building the documented images. Resolve tags ONCE; execution uses immutable IDs.
const images = { java: "eclipse-temurin:21-jdk-jammy", go: "learnharness-go:1.27", python: "python:3.14-slim", javascript: "node:26-bookworm-slim", typescript: "learnharness-typescript:5.6.3" };
const pins = Object.fromEntries(Object.entries(images).map(([language, tag]) => {
	const id = execFileSync("docker", ["image", "inspect", "--format", "{{.Id}}", tag], { encoding: "utf8" }).trim();
	if (!/^sha256:[a-f0-9]{64}$/.test(id)) throw new Error(`Invalid image ID for ${language}`);
	return [language, id];
}));
const data = process.env.LH_DATA_DIR ? path.resolve(process.env.LH_DATA_DIR) : path.resolve("data");
mkdirSync(data, { recursive: true });
writeFileSync(path.join(data, "runners.json"), JSON.stringify(pins, null, 2));
console.log("Pinned exercise runtimes in the active data folder.");
