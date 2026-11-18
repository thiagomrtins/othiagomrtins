import test from "node:test";
import assert from "node:assert/strict";
import { decodeEntities, toYoutubeVideo, rankByViews, parseApifyYoutube, fetchOfficialYoutube, YOUTUBE_LIMIT } from "../src/lib/youtube.ts";

const ID = (n) => `abcdefghi${String(n).padStart(2, "0")}`; // 11 caracteres

test("decodeEntities desfaz o que a busca do YouTube codifica", () => {
  assert.equal(decodeEntities("Pele &amp; Cabelo &#39;dicas&#39; &quot;top&quot;"), `Pele & Cabelo 'dicas' "top"`);
  assert.equal(decodeEntities("a &#x27;b&#x27; &lt;3"), "a 'b' <3");
  assert.equal(decodeEntities("sem entidade &desconhecida; fica"), "sem entidade &desconhecida; fica");
  assert.equal(decodeEntities("&#99999999999;"), "&#99999999999;");
});

test("toYoutubeVideo monta link e capa a partir do id, nunca do que a API devolve", () => {
  const v = toYoutubeVideo({ id: "7B1bL1QcjEY", title: "  Olá   mundo ", channel: "Canal", views: "2330300" });
  assert.deepEqual(v, {
    id: "7B1bL1QcjEY", title: "Olá mundo", channel: "Canal", views: 2330300,
    url: "https://www.youtube.com/watch?v=7B1bL1QcjEY",
    thumb: "https://i.ytimg.com/vi/7B1bL1QcjEY/hqdefault.jpg",
  });
});

test("toYoutubeVideo rejeita id inválido, título vazio e dados estranhos", () => {
  for (const id of ["curto", "tem espaço!!", "javascript:alert(1)", "../../etc/passwd", "abcdefghijkl", 123, null, undefined])
    assert.equal(toYoutubeVideo({ id, title: "t", channel: "c", views: 1 }), null, String(id));
  assert.equal(toYoutubeVideo({ id: ID(1), title: "   ", channel: "c", views: 1 }), null);
  assert.equal(toYoutubeVideo({ id: ID(1), title: 42, channel: "c", views: 1 }), null);
  assert.equal(toYoutubeVideo({ id: ID(1), title: "t", channel: null, views: "abc" }).views, null);
  assert.equal(toYoutubeVideo({ id: ID(1), title: "x".repeat(500), channel: "c", views: 1 }).title.length, 150);
});

test("rankByViews ordena, tira repetidos e limita a 10", () => {
  const list = Array.from({ length: 15 }, (_, i) => toYoutubeVideo({ id: ID(i), title: `v${i}`, channel: "c", views: i * 100 }));
  list.push(list[3], null);
  const out = rankByViews(list);
  assert.equal(out.length, YOUTUBE_LIMIT);
  assert.deepEqual(out.map((v) => v.views), [1400, 1300, 1200, 1100, 1000, 900, 800, 700, 600, 500]);
});

test("parseApifyYoutube lê o formato real do Actor e ignora o que não é vídeo", () => {
  const items = [
    { type: "video", id: "gjJIEmF3qQ0", title: "Leucodermia Solar", channelName: "Dr. Paulo Müller", viewCount: 2689006, thumbnailUrl: "https://evil.com/x.jpg", url: "javascript:alert(1)" },
    { type: "video", id: "d-97pEeP0LY", title: "Dermatologist Answers", channelName: "WIRED", viewCount: 6285030 },
    { type: "shorts", id: "SHORTSabc12", title: "curto", channelName: "x", viewCount: 9e9 },
    { id: "bad", title: "id ruim", viewCount: 1 },
    null,
  ];
  const out = parseApifyYoutube(items);
  assert.deepEqual(out.map((v) => v.id), ["d-97pEeP0LY", "gjJIEmF3qQ0"]);
  assert.ok(out.every((v) => v.url.startsWith("https://www.youtube.com/watch?v=") && v.thumb.startsWith("https://i.ytimg.com/")));
});

// ---- API oficial, com fetch simulado ----
function fakeGoogle({ searchIds, details, status = 200, errorReason } = {}) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url: new URL(String(url)), headers: init.headers });
    if (status !== 200) return new Response(JSON.stringify({ error: { errors: [{ reason: errorReason }] } }), { status });
    if (String(url).includes("/search")) return new Response(JSON.stringify({ items: searchIds.map((id) => ({ id: { videoId: id } })) }));
    return new Response(JSON.stringify({ items: details }));
  };
  return { impl, calls };
}

test("API oficial (pt): pede Brasil e português, manda a chave no cabeçalho, ordena por visualizações", async () => {
  const { impl, calls } = fakeGoogle({
    searchIds: [ID(1), ID(2), ID(3)],
    details: [
      { id: ID(1), snippet: { title: "Pele &amp; Sol", channelTitle: "A" }, statistics: { viewCount: "100" } },
      { id: ID(2), snippet: { title: "Dica &#39;top&#39;", channelTitle: "B" }, statistics: { viewCount: "9000" } },
      { id: ID(3), snippet: { title: "Sem número", channelTitle: "C" }, statistics: {} },
    ],
  });
  const out = await fetchOfficialYoutube("dermatologista", "pt", "CHAVE-SECRETA", impl);
  const search = calls[0].url;
  assert.equal(search.pathname, "/youtube/v3/search");
  assert.equal(search.searchParams.get("order"), "viewCount");
  assert.equal(search.searchParams.get("type"), "video");
  assert.equal(search.searchParams.get("maxResults"), "10");
  assert.equal(search.searchParams.get("regionCode"), "BR");
  assert.equal(search.searchParams.get("relevanceLanguage"), "pt");
  assert.equal(search.searchParams.get("q"), "dermatologista");
  assert.equal(calls[1].url.pathname, "/youtube/v3/videos");
  assert.equal(calls[1].url.searchParams.get("id"), `${ID(1)},${ID(2)},${ID(3)}`);
  for (const c of calls) {
    assert.equal(c.headers["x-goog-api-key"], "CHAVE-SECRETA");
    assert.ok(![...c.url.searchParams.values()].includes("CHAVE-SECRETA"), "a chave não pode ir na URL");
    assert.ok(!c.url.search.includes("key="), "sem parâmetro key=");
  }
  assert.deepEqual(out.map((v) => v.title), ["Dica 'top'", "Pele & Sol", "Sem número"]);
  assert.equal(out[2].views, null);
});

test("API oficial (global): não restringe país nem idioma", async () => {
  const { impl, calls } = fakeGoogle({ searchIds: [ID(1)], details: [{ id: ID(1), snippet: { title: "t", channelTitle: "c" }, statistics: { viewCount: "1" } }] });
  await fetchOfficialYoutube("skincare", "global", "K", impl);
  assert.equal(calls[0].url.searchParams.get("regionCode"), null);
  assert.equal(calls[0].url.searchParams.get("relevanceLanguage"), null);
});

test("API oficial: sem resultados não faz a segunda chamada; ids inválidos são ignorados", async () => {
  const a = fakeGoogle({ searchIds: [] });
  assert.deepEqual(await fetchOfficialYoutube("x", "pt", "K", a.impl), []);
  assert.equal(a.calls.length, 1);
  const b = fakeGoogle({ searchIds: ["inválido", "../x"] });
  assert.deepEqual(await fetchOfficialYoutube("x", "pt", "K", b.impl), []);
  assert.equal(b.calls.length, 1);
});

test("API oficial: erro devolve o motivo (sem expor a chave) para os Logs", async () => {
  const { impl } = fakeGoogle({ status: 403, errorReason: "quotaExceeded" });
  await assert.rejects(() => fetchOfficialYoutube("x", "pt", "CHAVE-SECRETA", impl), (e) => {
    assert.match(e.message, /403 \(quotaExceeded\)/);
    assert.ok(!e.message.includes("CHAVE-SECRETA"));
    return true;
  });
});
