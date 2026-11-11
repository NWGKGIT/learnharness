import { startExercise } from "@/src/server";
export const runtime = "nodejs";
export function POST(request: Request) { return startExercise(request); }
