import { NextResponse, type NextRequest } from "next/server";
import { searchTickers } from "@/server/company";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") ?? "";
  if (q.trim().length < 1 || q.length > 40) return NextResponse.json({ results: [] });
  return NextResponse.json({ results: searchTickers(q) });
}
