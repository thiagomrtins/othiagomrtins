import { NextRequest, NextResponse } from "next/server";
import { searchViralVideos } from "@/lib/apify";
import { MAX_BRANCHES } from "@/lib/expand";
import { cacheGet, cacheSet } from "@/lib/cache";
import { demoVideos } from "@/lib/demo";
import { allowRequest } from "@/lib/rateLimit";
import type { Language, SearchResult } from "@/lib/types";

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!allowRequest(ip)) {
    return NextResponse.json(
      { error: "Muitas buscas seguidas. Espere um minuto." },
      { status: 429 },
    );
  }

  const params = req.nextUrl.searchParams;
  const query = (params.get("q") ?? "").trim().replace(/\s+/g, " ");
  const language: Language = params.get("lang") === "global" ? "global" : "pt";

  // Ramificações escolhidas pela pessoa (separadas por "|"). Sem elas, usa só o assunto.
  const branches = [
    ...new Set(
      (params.get("v") ?? "")
        .split("|")
        .map((s) => s.trim().replace(/\s+/g, " "))
        .filter((s) => s.length >= 2 && s.length <= 80),
    ),
  ].slice(0, MAX_BRANCHES);

  if (query.length < 2 || query.length > 80) {
    return NextResponse.json(
      { error: "Digite entre 2 e 80 caracteres." },
      { status: 400 },
    );
  }

  const queries = language === "pt" && branches.length > 0 ? branches : [query];

  const token = process.env.APIFY_TOKEN;
  if (!token) {
    const result: SearchResult = {
      query,
      language,
      queries,
      videos: demoVideos(query, language),
      demo: true,
      cached: false,
      fetchedAt: new Date().toISOString(),
    };
    return NextResponse.json(result);
  }

  // O cache vem antes do Apify: é ele que mantém o custo baixo.
  const key = `${language}:${[...queries].map((q) => q.toLowerCase()).sort().join("|")}`;
  const hit = cacheGet<SearchResult>(key);
  if (hit) return NextResponse.json({ ...hit, cached: true });

  try {
    const videos = await searchViralVideos(queries, language, token);
    const result: SearchResult = {
      query,
      language,
      queries,
      videos,
      demo: false,
      cached: false,
      fetchedAt: new Date().toISOString(),
    };
    // Busca vazia não vai para o cache: senão o erro fica preso por horas.
    if (videos.length > 0) {
      const ttlHours = Number(process.env.CACHE_TTL_HOURS ?? 6);
      cacheSet(key, result, ttlHours * 3_600_000);
    }
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { error: "Não foi possível buscar agora. Tente de novo em instantes." },
      { status: 502 },
    );
  }
}
