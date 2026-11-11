import { sourceLibrarySnapshot, sourceLibraryAction } from "@/src/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET() { return sourceLibrarySnapshot(); }
export function POST(request: Request) { return sourceLibraryAction(request); }
