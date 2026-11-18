import type { VideoCard } from "@/lib/types";

const nf = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });

export function VideoCardView({ video, rank }: { video: VideoCard; rank: number }) {
  return (
    <article className="card">
      <a href={video.url} target="_blank" rel="noopener noreferrer" className="cover">
        {video.cover ? (
          // Link do TikTok é assinado e expira; sem referrer para não ser bloqueado.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={video.cover} alt="" referrerPolicy="no-referrer" loading="lazy" />
        ) : (
          <div className="placeholder">Sem imagem</div>
        )}
        <span className="rank">#{rank}</span>
      </a>
      <div className="body">
        <p className="stats">
          <strong>{nf.format(video.likes)}</strong> curtidas · {nf.format(video.views)} views
        </p>
        <p className="caption">{video.caption || "Sem legenda"}</p>
        {video.author && <p className="author">@{video.author}</p>}
        <a href={video.url} target="_blank" rel="noopener noreferrer" className="open">
          Abrir no TikTok ↗
        </a>
        {video.comments.length > 0 && (
          <details>
            <summary>Top {video.comments.length} comentários</summary>
            <ol>
              {video.comments.map((c, i) => (
                <li key={i}>
                  <span>{c.text}</span>
                  <small>♥ {nf.format(c.likes)}</small>
                </li>
              ))}
            </ol>
          </details>
        )}
      </div>
    </article>
  );
}
