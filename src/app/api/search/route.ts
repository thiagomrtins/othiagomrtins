import type { NextRequest } from "next/server";
import { fetchSearchPhrases, searchViralVideos } from "@/lib/apify";
import { takeBudget } from "@/lib/budget";
import { cacheGet, cacheSet } from "@/lib/cache";
import { demoTrending, demoVideos } from "@/lib/demo";
import { MAX_BRANCHES } from "@/lib/expand";
import { clientIp, crossSite, fail, json, logError } from "@/lib/http";
import { allowRequest } from "@/lib/rateLimit";
import { cleanText, parseBranches, positiveInt } from "@/lib/sanitize";
import type { Language, SearchPhrase, SearchResult } from "@/lib/types";

// A busca real leva de ~15 a ~75 s. O Apify aborta sozinho aos 240 s (veja apify.ts).
export const maxDuration = 300;

const PHRASES_TTL_SEC = 24 * 3600;

// Frases do TikTok ficam em cache e valem para todos os usuários do mesmo assunto.
// Se falhar, a busca segue sem esse bloco: ele nunca pode derrubar os vídeos.
async function phrasesFor(subject: string, token: string): Promise<SearchPhrase[]> {
  const key = `phrases:${subject.toLowerCase()}`;
  const hit = await cacheGet<SearchPhrase[]>(key);
  if (hit) return hit;
  if (!(await takeBudget("search"))) return [];
  try {
    const phrases = await fetchSearchPhrases(subject, token);
    if (phrases.length > 0) await cacheSet(key, phrases, PHRASES_TTL_SEC * 1000);
    return phrases;
  } catch (err) {
    logError("search:phrases", err);
    return [];
  }
}

export async function GET(req: NextRequest) {
  if (crossSite(req)) return fail("Pedido não permitido.", 403);

  if (!(await allowRequest(clientIp(req), "search", 8))) {
    return fail("Muitas buscas seguidas. Espere um minuto.", 429);
  }

  const params = req.nextUrl.searchParams;
  const query = cleanText(params.get("q"));
  if (!query) return fail("Digite entre 2 e 80 caracteres.", 400);
  const language: Language = params.get("lang") === "global" ? "global" : "pt";

  // Ramificações escolhidas pela pessoa (separadas por "|"). Sem elas, usa só o assunto.
  const branches = parseBranches(params.get("v"), MAX_BRANCHES);
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
    return json(result);
  }

  const ttlSec = positiveInt(process.env.CACHE_TTL_HOURS, 6) * 3600;

  // O cache vem antes do Apify: é ele que mantém o custo baixo.
  const key = `${language}:${[...queries].map((q) => q.toLowerCase()).sort().join("|")}`;
  const hit = await cacheGet<SearchResult>(key);
  if (hit) return json({ ...hit, cached: true }, { cacheSeconds: ttlSec });

  // Teto diário de buscas pagas, somando todos os usuários.
  if (!(await takeBudget("search"))) {
    return fail("O limite diário de buscas foi atingido. Tente de novo amanhã.", 503);
  }

  try {
    // Só em português: as frases vêm do TikTok do Brasil.
    const [found, searches] = await Promise.all([
      searchViralVideos(queries, language, token),
      language === "pt" ? phrasesFor(query, token) : Promise.resolve([] as SearchPhrase[]),
    ]);
    const result: SearchResult = {
      query,
      language,
      queries,
      videos: found.videos,
      trending: { ...found.trending, searches },
      demo: false,
      cached: false,
      fetchedAt: new Date().toISOString(),
    };
    // Busca vazia não vai para o cache: senão o erro fica preso por horas.
    if (result.videos.length === 0) return json(result);
    await cacheSet(key, result, ttlSec * 1000);
    return json(result, { cacheSeconds: ttlSec });
  } catch (err) {
    logError("search", err);
    return fail("Não foi possível buscar agora. Tente de novo em instantes.", 502);
  }
}
