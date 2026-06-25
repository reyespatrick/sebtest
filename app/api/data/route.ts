// API : sert les données depuis le cache SQLite (ne télécharge que ce qui manque).
import { NextResponse } from "next/server";
import { getData } from "../../lib/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const data = await getData();
  return NextResponse.json({ ...data, count: data.daily.length });
}
