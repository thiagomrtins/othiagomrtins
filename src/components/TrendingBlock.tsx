import type { Trending } from "@/lib/types";

const nf = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });

export function TrendingBlock({ trending }: { trending: Trending }) {
  if (trending.hashtags.length === 0 && trending.terms.length === 0) return null;
  const maxLikes = Math.max(...trending.hashtags.map((t) => t.likes), 1);

  return (
    <section className="trending">
      <h2>Em alta no TikTok</h2>
      <p className="hint">
        Ranking feito com as hashtags e os temas dos {trending.analyzed} vídeos desta busca. Não é a lista
        oficial do TikTok.
      </p>

      {trending.hashtags.length > 0 && (
        <ol className="rank-list">
          {trending.hashtags.map((t, i) => (
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
      )}

      {trending.terms.length > 0 && (
        <>
          <h3>Temas que mais aparecem</h3>
          <div className="chips">
            {trending.terms.map((t) => (
              <span key={t.label} className="chip on">
                {t.label} <small>{t.videos}</small>
              </span>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
