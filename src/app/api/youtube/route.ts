import type { NextRequest } from "next/server";
import { fetchYoutubeViaApify } from "@/lib/apify";
import { takeBudget } from "@/lib/budget";
import { cacheGet, cacheSet } from "@/lib/cache";
import { clientIp, crossSite, fail, json, logError } from "@/lib/http";
import { allowRequest } from "@/lib/rateLimit";
import { cleanText } from "@/lib/sanitize";
import type { Language, YoutubeResult, YoutubeVideo } from "@/lib/types";
import { fetchOfficialYoutube } from "@/lib/youtube";

// Pelo Apify: ~5 s no Actor rápido; no pior caso, a reserva faz até 2 tentativas.
export const maxDuration = 300;

const TTL_SEC = 24 * 3600;

function demo(query: string, language: Language): YoutubeResult {
  const videos: YoutubeVideo[] = Array.from({ length: 10 }, (_, i) => ({
    id: `demo${String(i).padStart(7, "0")}`,
    title: `Exemplo ${i + 1}: vídeo muito visto sobre ${query}`,
    channel: `Canal de exemplo ${i + 1}`,
    views: Math.round(4_000_000 / (i + 1)),
    url: "https://www.youtube.com/",
    thumb: `https://i.ytimg.com/vi/demo${String(i).padStart(7, "0")}/hqdefault.jpg`,
  }));
  return { query, language, source: "demo", videos };
}

export async function GET(req: NextRequest) {
  if (crossSite(req)) return fail("Pedido não permitido.", 403);
  if (!(await allowRequest(clientIp(req), "youtube", 10))) {
    return fail("Muitos pedidos seguidos. Espere um minuto.", 429);
  }

  const query = cleanText(req.nextUrl.searchParams.get("q"));
  if (!query) return fail("Digite entre 2 e 80 caracteres.", 400);
  const language: Language = req.nextUrl.searchParams.get("lang") === "global" ? "global" : "pt";

  const youtubeKey = process.env.YOUTUBE_API_KEY;
  const apifyToken = process.env.APIFY_TOKEN;
  if (!youtubeKey && !apifyToken) return json(demo(query, language));

  const key = `yt:${language}:${query.toLowerCase()}`;
  const hit = await cacheGet<YoutubeResult>(key);
  if (hit) return json(hit, { cacheSeconds: TTL_SEC });

  // Teto diário, somando todos os usuários (protege a cota do Google e o saldo do Apify).
  if (!(await takeBudget("youtube"))) {
    return fail("O limite diário de buscas no YouTube foi atingido. Tente de novo amanhã.", 503);
  }

  let source: YoutubeResult["source"] = "official";
  let videos: YoutubeVideo[] = [];
  let failed = false;

  if (youtubeKey) {
    try {
      videos = await fetchOfficialYoutube(query, language, youtubeKey);
    } catch (err) {
      logError("youtube:official", err);
      failed = true;
    }
  }
  // Sem chave, ou a API oficial falhou (cota, chave inválida): tenta o Actor do Apify.
  if ((!youtubeKey || failed) && apifyToken) {
    try {
      source = "apify";
      videos = await fetchYoutubeViaApify(query, apifyToken, language);
      failed = false;
    } catch (err) {
      logError("youtube:apify", err);
      failed = true;
    }
  }
  if (failed) return fail("Não foi possível buscar no YouTube agora.", 502);

  const result: YoutubeResult = { query, language, source, videos };
  // Resultado vazio não vai para o cache: senão o erro fica preso por horas.
  if (videos.length === 0) return json(result);
  await cacheSet(key, result, TTL_SEC * 1000);
  return json(result, { cacheSeconds: TTL_SEC });
}
