import test from "node:test";
import assert from "node:assert/strict";
import { topComments } from "../src/lib/comments.ts";

test("rápido (apidojo): lê likeCount e user.username, ordena e fica com 5", () => {
  const rows = [3, 900, 12, 55, 7, 400, 1].map((n, i) => ({
    text: `comentário ${i}`, likeCount: String(n), user: { username: `usuario${i}` },
  }));
  const out = topComments(rows, "fast");
  assert.equal(out.length, 5);
  assert.deepEqual(out.map((c) => c.likes), [900, 400, 55, 12, 7]);
  assert.equal(out[0].author, "usuario1");
});

test("padrão (clockworks): lê diggCount e uniqueId", () => {
  const out = topComments([{ text: "oi", diggCount: "10", uniqueId: "ana.silva" }, { text: "olá", diggCount: 50, uniqueId: "bia" }], "standard");
  assert.deepEqual(out.map((c) => [c.text, c.likes, c.author]), [["olá", 50, "bia"], ["oi", 10, "ana.silva"]]);
});

test("ignora linhas sem texto e números estranhos; limpa caracteres invisíveis e autor", () => {
  const out = topComments([
    null, {}, { text: "   " }, { text: 42 },
    { text: "ok\u0000​   texto", likeCount: "abc", user: { username: "<script>x" } },
  ], "fast");
  assert.equal(out.length, 1);
  assert.equal(out[0].text, "ok texto");
  assert.equal(out[0].likes, 0);
  assert.equal(out[0].author, "scriptx");
});

test("corta comentário gigante", () => {
  assert.equal(topComments([{ text: "x".repeat(2000), likeCount: 1 }], "fast")[0].text.length, 500);
});
