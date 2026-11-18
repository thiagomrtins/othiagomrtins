import type { Trending } from "@/lib/types";

const nf = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function TrendingBlock({
  trending,
  onPick,
}: {
  trending: Trending;
  onPick?: (phrase: string) => void;
}) {
  const { searches, hashtags, terms } = trending;
  if (searches.length === 0 && hashtags.length === 0 && terms.length === 0) return null;
  const maxLikes = Math.max(...hashtags.map((t) => t.likes), 1);

  return (
    <section className="trending">
      <h2>Em alta no TikTok</h2>

      {searches.length > 0 && (
        <div className="sub-block">
          <h3>Buscas em alta</h3>
          <p className="hint">
            Frases que o TikTok sugere quando alguém digita na busca, no Brasil. A ordem é a do TikTok, e não
            um volume de buscas. Clique para pesquisar.
          </p>
          <ol className="rank-list">
            {searches.map((s, i) => (
              <li key={s.phrase} className="phrase">
                <span className="pos">{i + 1}</span>
                <button type="button" className="phrase-btn" onClick={() => onPick?.(s.phrase)}>
                  {cap(s.phrase)}
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}

      {hashtags.length > 0 && (
        <div className="sub-block">
          <h3>Hashtags em alta nos vídeos</h3>
          <p className="hint">
            Contadas nos {trending.analyzed} vídeos desta busca. Não é a lista oficial do TikTok.
          </p>
          <ol className="rank-list">
            {hashtags.map((t, i) => (
              <li key={t.label}>
                <span className="pos">{i + 1}</span>
                <span className="tag">{t.label}</span>
                <span className="count">
                  {t.videos} {t.videos === 1 ? "vídeo" : "vídeos"} · {nf.format(t.likes)} curtidas
                </span>
                <span className="bar" aria-hidden="true">
                  <i style={{ width: `${Math.max(6, Math.round((t.likes / maxLikes) * 100))}%` }} />
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {terms.length > 0 && (
        <div className="sub-block">
          <h3>Temas que mais aparecem</h3>
          <div className="chips">
            {terms.map((t) => (
              <span key={t.label} className="chip on">
                {t.label} <small>{t.videos}</small>
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
