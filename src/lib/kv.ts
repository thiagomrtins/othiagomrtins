// Armazenamento chave-valor com expiração. Usa Upstash Redis (compartilhado entre todas as
// instâncias da Vercel) se UPSTASH_REDIS_REST_URL e UPSTASH_REDIS_REST_TOKEN existirem.
// Sem elas, cai para a memória do processo: funciona, mas cada instância tem a sua, então
// cache e limites ficam bem mais fracos. Se o Redis falhar, a requisição NÃO quebra.

const PREFIX = "bv:";
const MAX_MEMORY_KEYS = 1000;
const REDIS_TIMEOUT_MS = 2500;

interface MemEntry {
  value: string;
  expiresAt: number;
}
const memory = new Map<string, MemEntry>();

function memSet(key: string, value: string, ttlSec: number) {
  if (memory.size >= MAX_MEMORY_KEYS && !memory.has(key)) {
    const oldest = memory.keys().next().value;
    if (oldest !== undefined) memory.delete(oldest);
  }
  memory.set(key, { value, expiresAt: Date.now() + ttlSec * 1000 });
}

function memGet(key: string): string | null {
  const hit = memory.get(key);
  if (!hit) return null;
  if (hit.expiresAt < Date.now()) {
    memory.delete(key);
    return null;
  }
  return hit.value;
}

function redisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token || !url.startsWith("https://")) return null;
  return { url: url.replace(/\/$/, ""), token };
}

type Cmd = (string | number)[];

// Manda uma lista de comandos de uma vez. Devolve null se o Redis não existe ou falhou.
async function redis(cmds: Cmd[]): Promise<unknown[] | null> {
  const cfg = redisConfig();
  if (!cfg) return null;
  try {
    const res = await fetch(`${cfg.url}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(cmds),
      signal: AbortSignal.timeout(REDIS_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const out = (await res.json()) as { result?: unknown; error?: string }[];
    return out.map((o) => (o.error ? null : (o.result ?? null)));
  } catch {
    return null;
  }
}

export async function kvGet<T>(key: string): Promise<T | null> {
  const k = PREFIX + key;
  const r = await redis([["GET", k]]);
  const raw = r ? r[0] : memGet(k);
  if (typeof raw !== "string") return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function kvSet(key: string, value: unknown, ttlSec: number): Promise<void> {
  const k = PREFIX + key;
  const json = JSON.stringify(value);
  const ttl = Math.max(1, Math.floor(ttlSec));
  const r = await redis([["SET", k, json, "EX", ttl]]);
  if (!r) memSet(k, json, ttl);
}

// Soma 1 ao contador e devolve o valor novo. O contador expira sozinho depois de ttlSec.
export async function kvIncr(key: string, ttlSec: number): Promise<number> {
  const k = PREFIX + key;
  const ttl = Math.max(1, Math.floor(ttlSec));
  const r = await redis([
    ["SET", k, "0", "EX", ttl, "NX"],
    ["INCR", k],
  ]);
  if (r && typeof r[1] === "number") return r[1];
  const n = Number(memGet(k) ?? "0") + 1;
  memSet(k, String(n), ttl);
  return n;
}

// Só para testes.
export function __resetMemory() {
  memory.clear();
}
