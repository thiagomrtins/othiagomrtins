import { NextRequest, NextResponse } from "next/server";

// IP de quem chamou. Na Vercel esses cabeçalhos são preenchidos pela própria plataforma.
export function clientIp(req: NextRequest): string {
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real.slice(0, 64);
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (fwd || "unknown").slice(0, 64);
}

// Barra chamadas vindas de OUTROS sites (um site alheio mandando o navegador do visitante
// gastar o seu saldo). Navegadores informam a origem em Sec-Fetch-Site; curl não manda nada.
export function crossSite(req: NextRequest): boolean {
  const site = req.headers.get("sec-fetch-site");
  return site !== null && site !== "same-origin" && site !== "none";
}

interface JsonOptions {
  status?: number;
  // Se informado, a Vercel guarda a resposta pública por esse tempo (em segundos).
  cacheSeconds?: number;
}

export function json(data: unknown, { status = 200, cacheSeconds }: JsonOptions = {}) {
  const cache =
    cacheSeconds && status === 200
      ? `public, s-maxage=${Math.floor(cacheSeconds)}, stale-while-revalidate=${Math.min(Math.floor(cacheSeconds), 3600)}`
      : "no-store";
  return NextResponse.json(data, { status, headers: { "Cache-Control": cache } });
}

export function fail(message: string, status: number) {
  return json({ error: message }, { status });
}

// Registra só a mensagem, para ajudar nos Logs da Vercel. Nunca registra chaves nem o corpo das respostas.
export function logError(scope: string, err: unknown) {
  console.error(`[${scope}]`, err instanceof Error ? err.message : "erro desconhecido");
}
