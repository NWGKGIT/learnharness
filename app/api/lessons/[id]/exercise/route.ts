import { currentCodingExercise } from "@/src/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
	return currentCodingExercise((await context.params).id);
}
