import test from "node:test";
import assert from "node:assert/strict";
import { cleanText, isTikTokVideoUrl, parseBranches, positiveInt, safeHttpsUrl } from "../src/lib/sanitize.ts";

test("cleanText limpa espaços e caracteres invisíveis", () => {
  assert.equal(cleanText("  marketing   digital  "), "marketing digital");
  assert.equal(cleanText("skin\u0000care​ ok"), "skin care ok");
  assert.equal(cleanText("a\nb\tc"), "a b c");
});

test("cleanText rejeita vazio, curto, longo e não-texto", () => {
  assert.equal(cleanText(""), null);
  assert.equal(cleanText("a"), null);
  assert.equal(cleanText("x".repeat(81)), null);
  assert.equal(cleanText("x".repeat(80)), "x".repeat(80));
  assert.equal(cleanText(null), null);
  assert.equal(cleanText(["a", "b"]), null);
  assert.equal(cleanText(123), null);
});

test("parseBranches limita, remove repetidas e ignora lixo", () => {
  assert.deepEqual(parseBranches("a b|A B|c d|", 5), ["a b", "c d"]);
  assert.deepEqual(parseBranches(null, 5), []);
  assert.equal(parseBranches("aa|bb|cc|dd|ee|ff|gg", 5).length, 5);
});

test("isTikTokVideoUrl aceita só vídeos do TikTok em https", () => {
  assert.ok(isTikTokVideoUrl("https://www.tiktok.com/@ivan.dermato/video/7586702981027073300"));
  assert.ok(isTikTokVideoUrl("https://tiktok.com/@a_b-c/video/1234567"));
  for (const bad of [
    "http://www.tiktok.com/@a/video/1234567",
    "https://evil.com/@a/video/1234567",
    "https://www.tiktok.com.evil.com/@a/video/1234567",
    "https://www.tiktok.com/@a/video/1234567?x=1",
    "https://www.tiktok.com/@a/video/12",
    "javascript:alert(1)",
    "https://www.tiktok.com/@a/video/1234567/../../x",
    "",
    null,
    42,
  ]) assert.equal(isTikTokVideoUrl(bad), false, String(bad));
});

test("safeHttpsUrl bloqueia javascript:, data:, http: e lixo", () => {
  assert.equal(safeHttpsUrl("https://p16.tiktokcdn-us.com/a.jpg"), "https://p16.tiktokcdn-us.com/a.jpg");
  for (const bad of ["javascript:alert(1)", "data:text/html,x", "http://a.com/x.jpg", "nao é url", "", null, undefined])
    assert.equal(safeHttpsUrl(bad), null, String(bad));
});

test("positiveInt usa o padrão quando o valor é inválido", () => {
  assert.equal(positiveInt("24", 6), 24);
  assert.equal(positiveInt(undefined, 6), 6);
  assert.equal(positiveInt("0", 6), 6);
  assert.equal(positiveInt("-3", 6), 6);
  assert.equal(positiveInt("abc", 6), 6);
  assert.equal(positiveInt("7.9", 6), 7);
});
