import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { containerArguments, executeExercise } from "../src/server/exercise-runner.ts";
import type { ExerciseLanguage, ExerciseRun } from "../src/core/exercises.ts";

test("runner confines execution and never interpolates learner code into a shell", () => {
	const args = containerArguments("test", "/tmp/example", "sha256:example", ["python", "main.py"]);
	for (const flag of ["--network=none", "--memory=1g", "--cpus=1", "--pids-limit=256", "--cap-drop=ALL", "--read-only", "--pull=never"]) assert.ok(args.includes(flag));
	assert.deepEqual(args.slice(-3), ["sha256:example", "python", "main.py"]);
	assert.ok(!args.includes("sh"));
});

const enabled = process.env.LH_RUN_DOCKER_TESTS === "1";
const examples: Record<ExerciseLanguage, string> = {
	java: 'public class Main { public static void main(String[] args) { System.out.println("42"); } }',
	go: 'package main\nimport "fmt"\nfunc main() { fmt.Println(42) }',
	python: 'print(42)', javascript: 'console.log(42)', typescript: 'const n: number = 42; console.log(n);',
};
function run(language: ExerciseLanguage, source: string, signal = new AbortController().signal) {
	const record: ExerciseRun = { id: randomUUID(), lessonId: "test", language, source, stdin: "", status: "running", stage: "compile", stdout: "", stderr: "", exitCode: null, createdAt: new Date().toISOString() };
	return executeExercise(record, signal, () => {});
}
for (const [language, source] of Object.entries(examples)) test(`Docker executes ${language}`, { skip: !enabled }, async () => {
	const result = await run(language as ExerciseLanguage, source);
	assert.equal(result.status, "passed", result.stderr);
	assert.equal(result.stdout.trim(), "42");
});
test("Docker reports compilation failure, blocks networking, times out and cancels", { skip: !enabled }, async () => {
	assert.equal((await run("java", "invalid Java")).status, "failed");
	const network = await run("python", 'import socket\nsocket.create_connection(("1.1.1.1", 80), timeout=1)');
	assert.equal(network.status, "failed");
	assert.equal((await run("python", "while True: pass")).status, "timeout");
	const controller = new AbortController();
	const pending = run("python", "import time; time.sleep(60)", controller.signal);
	setTimeout(() => controller.abort(), 1000);
	assert.equal((await pending).status, "cancelled");
});
