import { notesSnapshot, notesAction } from "@/src/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET() { return notesSnapshot(); }
export function POST(request: Request) { return notesAction(request); }
