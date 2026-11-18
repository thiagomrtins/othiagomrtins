import Anthropic from "@anthropic-ai/sdk";
import { cacheGet, cacheSet } from "./cache";
import type { ExpandResult } from "./types";

export const MAX_BRANCHES = 5;
// Modelo barato: a tarefa é só gerar frases curtas. Troque por ANTHROPIC_MODEL se quiser.
const DEFAULT_MODEL = "claude-haiku-5-5";
const DAY_MS = 24 * 3_600_000;

// Sem chave (ou se a IA falhar) usamos regras simples. Pior que a IA, mas nunca deixa a busca parada.
export function rulesExpand(query: string): string[] {
  const q = query.trim();
  return [
    q,
    `como ${q} para iniciantes`,
    `dicas de ${q}`,
    `${q} passo a passo`,
    `erros comuns em ${q}`,
  ].slice(0, MAX_BRANCHES);
}

function clean(list: unknown, original: string): string[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of [original, ...list]) {
    if (typeof item !== "string") continue;
    const s = item.trim().replace(/\s+/g, " ");
    const k = s.toLowerCase();
    if (s.length < 2 || s.length > 80 || seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out.slice(0, MAX_BRANCHES);
}

async function aiExpand(query: string, apiKey: string): Promise<string[]> {
  const client = new Anthropic({ apiKey, maxRetries: 1, timeout: 20_000 });
  const response = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL,
    max_tokens: 1024,
    output_config: {
      effort: "low",
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: {
            queries: { type: "array", items: { type: "string" } },
          },
          required: ["queries"],
          additionalProperties: false,
        },
      },
    },
    system:
      "Você ajuda a encontrar vídeos do TikTok em português do Brasil. " +
      "Dado um assunto, devolva ramificações de busca: frases curtas e naturais, " +
      "como um brasileiro digitaria na busca do TikTok, cobrindo ângulos diferentes " +
      "do mesmo assunto (iniciantes, erros comuns, passo a passo, resultados, ferramentas). " +
      `Máximo ${MAX_BRANCHES - 1} frases, até 6 palavras cada, sem hashtags, sem repetir o assunto original.`,
    messages: [{ role: "user", content: `Assunto: ${query}` }],
  });

  if (response.stop_reason === "refusal") return [];
  const block = response.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") return [];
  const parsed = JSON.parse(block.text) as { queries?: unknown };
  return clean(parsed.queries, query);
}

export async function expandQuery(query: string): Promise<ExpandResult> {
  const key = `expand:${query.toLowerCase()}`;
  const hit = cacheGet<ExpandResult>(key);
  if (hit) return hit;

  let result: ExpandResult = { query, queries: rulesExpand(query), source: "rules" };
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey) {
    try {
      const queries = await aiExpand(query, apiKey);
      if (queries.length > 1) result = { query, queries, source: "ai" };
    } catch {
      // Mantém as regras: a busca não pode depender da IA.
    }
  }
  cacheSet(key, result, DAY_MS);
  return result;
}
