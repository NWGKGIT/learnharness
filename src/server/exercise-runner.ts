import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { PATHS } from "../../config.ts";
import type { ExerciseLanguage, ExerciseRun } from "../core/exercises.ts";

const adapters: Record<ExerciseLanguage, { filename: string; compile?: string[]; run: string[] }> = {
	java: { filename: "Main.java", compile: ["javac", "Main.java"], run: ["java", "-Xmx512m", "Main"] },
	go: { filename: "main.go", compile: ["sh", "-c", "cp -a /opt/go-cache /tmp/go-cache && exec go build -o exercise main.go"], run: ["./exercise"] },
	python: { filename: "main.py", run: ["python", "-B", "main.py"] },
	javascript: { filename: "main.js", run: ["node", "main.js"] },
	typescript: { filename: "main.ts", compile: ["tsc", "--strict", "--target", "ES2022", "--module", "commonjs", "main.ts"], run: ["node", "main.js"] },
};

export function containerArguments(name: string, directory: string, image: string, command: string[]): string[] {
	return ["run", "--rm", "--pull=never", "--name", name, "--network=none", "--cpus=1", "--memory=1g", "--memory-swap=1g", "--pids-limit=256", "--cap-drop=ALL", "--security-opt=no-new-privileges", "--read-only", "--user", `${process.getuid?.() || 1000}:${process.getgid?.() || 1000}`, "--tmpfs", "/tmp:rw,nosuid,size=536870912", "--mount", `type=bind,src=${directory},dst=/workspace`, "--workdir", "/workspace", "--env", "GOCACHE=/tmp/go-cache", "--env", "GOTOOLCHAIN=local", "--env", "GOPATH=/tmp/go", "--env", "HOME=/tmp", "-i", image, ...command];
}

/** All code is confined to the isolated exercise directory. No shell interpolation or host fallback. */
export async function executeExercise(run: ExerciseRun, signal: AbortSignal, update: (run: ExerciseRun) => void): Promise<ExerciseRun> {
	let directory: string | undefined;
	try {
		const pins = JSON.parse(await readFile(path.join(PATHS.data, "runners.json"), "utf8")) as Record<string, string>;
		const image = pins[run.language];
		if (!image || !/^sha256:[a-f0-9]{64}$/.test(image)) throw new Error("Exercise runtimes are not configured. Run scripts/setup-runners.mjs after installing the images.");
		directory = await mkdtemp(path.join(tmpdir(), "learnharness-exercise-"));
		const adapter = adapters[run.language];
		await writeFile(path.join(directory, adapter.filename), run.source);
		let bytes = 0;
		for (const stage of ["compile", "execute"] as const) {
			const command = stage === "compile" ? adapter.compile : adapter.run;
			if (!command) continue;
			if (signal.aborted) { run.status = "cancelled"; break; }
			run.stage = stage; update({ ...run });
			const name = `lh-exercise-${randomUUID()}`;
			await new Promise<void>((resolve, reject) => {
				// The in-container deadline survives a server restart; the host timer also cancels the client.
				const child = spawn("docker", containerArguments(name, directory!, image, ["timeout", "--signal=KILL", stage === "compile" ? "30s" : "10s", ...command]), { stdio: ["pipe", "pipe", "pipe"] });
				let killing = false;
				const stop = (status: ExerciseRun["status"]) => {
					if (killing) return;
					killing = true; run.status = status;
					child.kill("SIGKILL");
				};
				const abort = () => stop("cancelled");
				const timer = setTimeout(() => stop("timeout"), stage === "compile" ? 30_000 : 10_000);
				signal.addEventListener("abort", abort, { once: true });
				const capture = (key: "stdout" | "stderr", chunk: Buffer) => {
					const remaining = Math.max(0, 1_048_576 - bytes);
					run[key] += chunk.subarray(0, remaining).toString(); bytes += chunk.length;
					if (bytes > 1_048_576) stop("failed");
				};
				child.stdout.on("data", (data: Buffer) => capture("stdout", data));
				child.stderr.on("data", (data: Buffer) => capture("stderr", data));
				child.stdin.on("error", () => {});
				child.stdin.end(stage === "execute" ? run.stdin : "");
				child.on("error", reject);
				child.on("close", (code) => {
					clearTimeout(timer); signal.removeEventListener("abort", abort);
					run.exitCode = code;
					if (!killing && code !== 0) run.status = code === 124 ? "timeout" : code === 125 || code === 127 ? "unavailable" : "failed";
					// Always remove by our unique name, including cancelled Docker clients.
					const cleanup = spawn("docker", ["rm", "-f", name], { stdio: "ignore" });
					cleanup.on("error", () => resolve()); cleanup.on("close", () => resolve());
				});
			});
			if (run.status !== "running") break;
		}
		if (run.status === "running") run.status = "passed";
	} catch (error) {
		run.status = signal.aborted ? "cancelled" : "unavailable";
		run.stderr = error instanceof Error ? error.message : "Execution unavailable";
	} finally { if (directory) await rm(directory, { recursive: true, force: true }); }
	update({ ...run });
	return run;
}
