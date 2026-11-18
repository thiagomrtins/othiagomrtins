import { NextRequest, NextResponse } from "next/server";
import { expandQuery } from "@/lib/expand";
import { allowRequest } from "@/lib/rateLimit";

export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!allowRequest(ip, 20)) {
    return NextResponse.json({ error: "Muitas buscas seguidas. Espere um minuto." }, { status: 429 });
  }
  const query = (req.nextUrl.searchParams.get("q") ?? "").trim().replace(/\s+/g, " ");
  if (query.length < 2 || query.length > 80) {
    return NextResponse.json({ error: "Digite entre 2 e 80 caracteres." }, { status: 400 });
  }
  return NextResponse.json(await expandQuery(query));
}
