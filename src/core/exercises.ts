export type ExerciseLanguage = "java" | "go" | "python" | "javascript" | "typescript";
export interface ExerciseCase { id: string; label: string; stdin: string; expected: string; hidden: boolean }
export interface CodingExercise {
	id: string; lessonId: string; sectionId: string; taskId: string; objectiveIds: string[];
	language: ExerciseLanguage; title: string; instructions: string; starter: string;
	reference: string; tests: ExerciseCase[]; revealed: boolean;
}
export type PublicCodingExercise = Omit<CodingExercise, "reference">;
export interface ExerciseCaseResult { id: string; label: string; stdin: string; expected: string; actual: string; passed: boolean; stderr: string }
export interface ExerciseRun {
	id: string;
	lessonId: string;
	language: ExerciseLanguage;
	source: string;
	stdin: string;
	status: "running" | "passed" | "failed" | "cancelled" | "timeout" | "unavailable";
	stage: "compile" | "execute";
	stdout: string;
	stderr: string;
	exitCode: number | null;
	createdAt: string;
	exerciseId?: string;
	previouslyRevealed?: boolean;
	purpose?: "examples" | "submission";
	results?: ExerciseCaseResult[];
}
