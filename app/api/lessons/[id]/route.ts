import { learningWorkspace, lessonHttp } from "@/src/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
	return lessonHttp(learningWorkspace()).get((await context.params).id);
}
export async function POST(request: Request, context: Context) {
	return lessonHttp(learningWorkspace()).action((await context.params).id, request);
}
