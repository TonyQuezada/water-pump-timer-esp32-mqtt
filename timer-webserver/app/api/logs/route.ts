import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { logQueries } from "@/lib/db";

export async function GET() {
  const session = await auth();

  if (!session?.user || (session.user as any).role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const logs = logQueries.getAll.all();
  return NextResponse.json({ logs });
}