import { z } from "zod";
export const codingExerciseSchema = z.object({
	taskId: z.string().min(1).max(200), objectiveIds: z.array(z.string()).min(1).max(20),
	language: z.enum(["java", "go", "python", "javascript", "typescript"]),
	title: z.string().min(1).max(200), instructions: z.string().min(1).max(12000),
	starter: z.string().max(100000), reference: z.string().min(1).max(100000),
	tests: z.array(z.object({ id: z.string().min(1).max(100), label: z.string().min(1).max(200), stdin: z.string().max(65536), expected: z.string().max(65536), hidden: z.boolean() }).strict()).min(2).max(8),
}).strict();
export type CodingExerciseInput = z.infer<typeof codingExerciseSchema>;
/** Line-ending differences and a final newline do not change a program's answer. */
export function exerciseOutputMatches(actual: string, expected: string): boolean {
	const normalize = (value: string) => value.replace(/\r\n/g, "\n").replace(/\n$/, "");
	return normalize(actual) === normalize(expected);
}
