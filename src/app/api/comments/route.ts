import { NextRequest, NextResponse } from "next/server";
import { fetchTopComments } from "@/lib/apify";
import { cacheGet, cacheSet } from "@/lib/cache";
import { demoComments } from "@/lib/demo";
import { allowRequest } from "@/lib/rateLimit";
import type { TopComment } from "@/lib/types";

export const maxDuration = 120;

// Só aceita link de vídeo do TikTok: impede usar a rota para raspar qualquer endereço.
const VIDEO_URL = /^https:\/\/(www\.)?tiktok\.com\/@[\w.\-]+\/video\/\d+$/;

export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!allowRequest(ip, 15)) {
    return NextResponse.json({ error: "Muitos pedidos seguidos. Espere um minuto." }, { status: 429 });
  }

  const url = (req.nextUrl.searchParams.get("url") ?? "").split("?")[0];
  const token = process.env.APIFY_TOKEN;
  if (!token) return NextResponse.json({ comments: demoComments(), demo: true });
  if (!VIDEO_URL.test(url)) {
    return NextResponse.json({ error: "Link de vídeo inválido." }, { status: 400 });
  }

  const key = `comments:${url}`;
  const hit = cacheGet<TopComment[]>(key);
  if (hit) return NextResponse.json({ comments: hit });

  try {
    const comments = await fetchTopComments(url, token);
    if (comments.length > 0) cacheSet(key, comments, 24 * 3_600_000);
    return NextResponse.json({ comments });
  } catch {
    return NextResponse.json({ error: "Não foi possível carregar os comentários." }, { status: 502 });
  }
}
