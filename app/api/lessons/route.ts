import { learningWorkspace, lessonHttp, createLearningLesson } from "@/src/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET() { return lessonHttp(learningWorkspace()).list(); }
export function POST(request: Request) { return createLearningLesson(request); }
