// Utilitários de tempo e paralelismo, sem dependências, para testar fácil.

export const CANCELLED = "Cancelado";

// Espera `ms`, mas acorda na hora (com erro "Cancelado") se o sinal for acionado.
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new Error(CANCELLED));
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error(CANCELLED));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

// Roda todas as tarefas ao mesmo tempo. Quando a PRIMEIRA termina, as outras ganham `graceMs`
// para acabar; as que passarem disso recebem o sinal de cancelamento. Devolve só o que deu certo.
// Assim uma tarefa lenta não segura o resultado das rápidas.
export async function raceWithGrace<T>(
  jobs: ((signal: AbortSignal) => Promise<T>)[],
  graceMs: number,
  onError?: (err: unknown) => void,
): Promise<T[]> {
  const ctrl = new AbortController();
  const out: T[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.all(
    jobs.map(async (job) => {
      try {
        out.push(await job(ctrl.signal));
        if (!timer) timer = setTimeout(() => ctrl.abort(), graceMs);
      } catch (err) {
        if (!(err instanceof Error && err.message === CANCELLED)) onError?.(err);
      }
    }),
  );
  if (timer) clearTimeout(timer);
  return out;
}
