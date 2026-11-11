import { exerciseStatus, cancelExercise } from "@/src/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, { params }: Context) { return exerciseStatus((await params).id); }
export async function DELETE(_request: Request, { params }: Context) { return cancelExercise((await params).id); }
