import { kvGet, kvSet } from "./kv";

// Cache de resultados (Redis se configurado, senão memória). TTL em milissegundos.
export function cacheGet<T>(key: string): Promise<T | null> {
  return kvGet<T>(`c:${key}`);
}

export function cacheSet<T>(key: string, value: T, ttlMs: number): Promise<void> {
  return kvSet(`c:${key}`, value, ttlMs / 1000);
}
