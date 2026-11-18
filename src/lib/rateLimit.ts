import { kvIncr } from "./kv";

// Limite por IP em janela fixa de `windowSec` segundos. Com Redis vale para todas as
// instâncias; sem Redis vale só dentro de cada instância.
export async function allowRequest(
  ip: string,
  bucket: string,
  max: number,
  windowSec = 60,
): Promise<boolean> {
  const slot = Math.floor(Date.now() / (windowSec * 1000));
  const n = await kvIncr(`rl:${bucket}:${ip}:${slot}`, windowSec * 2);
  return n <= max;
}
