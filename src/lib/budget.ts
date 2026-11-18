import { positiveInt } from "./sanitize";
import { kvIncr } from "./kv";

// Teto diário de execuções que gastam dinheiro, somando TODOS os usuários.
// Segura o seu saldo mesmo se alguém usar muitos IPs diferentes.
// Cada busca completa usa 2 execuções (vídeos + frases), então 60 = cerca de 30 buscas por dia.
export type BudgetKind = "search" | "comments" | "expand" | "youtube";

function limitFor(kind: BudgetKind): number {
  switch (kind) {
    case "search":
      return positiveInt(process.env.DAILY_SEARCH_LIMIT, 60);
    case "comments":
      return positiveInt(process.env.DAILY_COMMENTS_LIMIT, 100);
    case "expand":
      return positiveInt(process.env.DAILY_EXPAND_LIMIT, 500);
    case "youtube":
      // Cada busca na API oficial usa ~101 unidades da cota grátis de 10.000 por dia.
      return positiveInt(process.env.DAILY_YOUTUBE_LIMIT, 60);
  }
}

// true = pode gastar. Conta 1 uso por chamada.
export async function takeBudget(kind: BudgetKind): Promise<boolean> {
  const day = new Date().toISOString().slice(0, 10);
  const n = await kvIncr(`budget:${kind}:${day}`, 26 * 3600);
  return n <= limitFor(kind);
}
