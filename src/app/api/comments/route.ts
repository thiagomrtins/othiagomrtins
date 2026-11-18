import type { NextRequest } from "next/server";
import { fetchTopComments } from "@/lib/apify";
import { takeBudget } from "@/lib/budget";
import { cacheGet, cacheSet } from "@/lib/cache";
import { demoComments } from "@/lib/demo";
import { clientIp, crossSite, fail, json, logError } from "@/lib/http";
import { allowRequest } from "@/lib/rateLimit";
import { isTikTokVideoUrl } from "@/lib/sanitize";
import type { TopComment } from "@/lib/types";

export const maxDuration = 120;

const TTL_SEC = 24 * 3600;

export async function GET(req: NextRequest) {
  if (crossSite(req)) return fail("Pedido não permitido.", 403);
  if (!(await allowRequest(clientIp(req), "comments", 12))) {
    return fail("Muitos pedidos seguidos. Espere um minuto.", 429);
  }

  const token = process.env.APIFY_TOKEN;
  if (!token) return json({ comments: demoComments(), demo: true });

  // Só aceita link de vídeo do TikTok: impede usar a rota para raspar qualquer endereço.
  const url = (req.nextUrl.searchParams.get("url") ?? "").split("?")[0];
  if (!isTikTokVideoUrl(url)) return fail("Link de vídeo inválido.", 400);

  const key = `comments:${url}`;
  const hit = await cacheGet<TopComment[]>(key);
  if (hit) return json({ comments: hit }, { cacheSeconds: TTL_SEC });

  if (!(await takeBudget("comments"))) {
    return fail("O limite diário de comentários foi atingido. Tente de novo amanhã.", 503);
  }

  try {
    const comments = await fetchTopComments(url, token);
    if (comments.length === 0) return json({ comments });
    await cacheSet(key, comments, TTL_SEC * 1000);
    return json({ comments }, { cacheSeconds: TTL_SEC });
  } catch (err) {
    logError("comments", err);
    return fail("Não foi possível carregar os comentários.", 502);
  }
}
