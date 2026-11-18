import { NextRequest, NextResponse } from "next/server";
import { fetchSearchPhrases, searchViralVideos } from "@/lib/apify";
import { MAX_BRANCHES } from "@/lib/expand";
import { cacheGet, cacheSet } from "@/lib/cache";
import { demoTrending, demoVideos } from "@/lib/demo";
import { allowRequest } from "@/lib/rateLimit";
import type { Language, SearchPhrase, SearchResult } from "@/lib/types";

export const maxDuration = 300;

// Frases do TikTok ficam 24 h em cache e valem para todos os usuários do mesmo assunto.
// Se falhar, a busca segue sem esse bloco: ele nunca pode derrubar os vídeos.
async function phrasesFor(subject: string, token: string): Promise<SearchPhrase[]> {
  const key = `phrases:${subject.toLowerCase()}`;
  const hit = cacheGet<SearchPhrase[]>(key);
  if (hit) return hit;
  try {
    const phrases = await fetchSearchPhrases(subject, token);
    if (phrases.length > 0) cacheSet(key, phrases, 24 * 3_600_000);
    return phrases;
  } catch {
    return [];
  }
}

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
      trending: demoTrending(),
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
    // Só em português: as frases vêm do TikTok do Brasil.
    const [found, searches] = await Promise.all([
      searchViralVideos(queries, language, token),
      language === "pt" ? phrasesFor(query, token) : Promise.resolve([] as SearchPhrase[]),
    ]);
    const { videos } = found;
    const trending = { ...found.trending, searches };
    const result: SearchResult = {
      query,
      language,
      queries,
      videos,
      trending,
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
