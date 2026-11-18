"use client";

import { useState } from "react";
import type { TopComment, VideoCard } from "@/lib/types";

const nf = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });

export function VideoCardView({ video, rank }: { video: VideoCard; rank: number }) {
  const [comments, setComments] = useState<TopComment[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imgFailed, setImgFailed] = useState(false);

  // Comentários só são buscados (e cobrados) quando a pessoa pede.
  async function loadComments() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/comments?url=${encodeURIComponent(video.url)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao carregar");
      setComments(data.comments as TopComment[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <article className="card">
      <a href={video.url} target="_blank" rel="noopener noreferrer" className="cover">
        {video.cover && !imgFailed ? (
          // Link do TikTok é assinado e expira; sem referrer para não ser bloqueado.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={video.cover}
            alt=""
            referrerPolicy="no-referrer"
            loading={rank <= 4 ? "eager" : "lazy"}
            decoding="async"
            onError={() => setImgFailed(true)}
          />
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
        {comments === null ? (
          <button type="button" className="ghost" onClick={loadComments} disabled={loading}>
            {loading ? "Carregando…" : "Ver top 5 comentários"}
          </button>
        ) : comments.length === 0 ? (
          <p className="author">Sem comentários disponíveis.</p>
        ) : (
          <ol>
            {comments.map((c, i) => (
              <li key={i}>
                <span>{c.text}</span>
                <small>♥ {nf.format(c.likes)}</small>
              </li>
            ))}
          </ol>
        )}
        {error && <p className="error">{error}</p>}
      </div>
    </article>
  );
}
