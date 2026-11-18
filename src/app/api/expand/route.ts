import type { NextRequest } from "next/server";
import { expandQuery } from "@/lib/expand";
import { clientIp, crossSite, fail, json, logError } from "@/lib/http";
import { allowRequest } from "@/lib/rateLimit";
import { cleanText } from "@/lib/sanitize";

export async function GET(req: NextRequest) {
  if (crossSite(req)) return fail("Pedido não permitido.", 403);
  if (!(await allowRequest(clientIp(req), "expand", 20))) {
    return fail("Muitas buscas seguidas. Espere um minuto.", 429);
  }
  const query = cleanText(req.nextUrl.searchParams.get("q"));
  if (!query) return fail("Digite entre 2 e 80 caracteres.", 400);
  try {
    return json(await expandQuery(query), { cacheSeconds: 24 * 3600 });
  } catch (err) {
    logError("expand", err);
    return fail("Não foi possível sugerir buscas agora.", 502);
  }
}
