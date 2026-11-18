import test from "node:test";
import assert from "node:assert/strict";
import { kvGet, kvSet, kvIncr, __resetMemory } from "../src/lib/kv.ts";

const clearEnv = () => {
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
};

// Redis falso: guarda em um Map e registra cada chamada recebida.
function fakeRedis({ fail = false } = {}) {
  const store = new Map();
  const calls = [];
  const impl = async (url, init) => {
    const cmds = JSON.parse(init.body);
    calls.push({ url: String(url), auth: init.headers.Authorization, cmds });
    if (fail) throw new Error("queda de rede");
    const out = cmds.map(([cmd, k, v, ...rest]) => {
      if (cmd === "GET") return { result: store.get(k) ?? null };
      if (cmd === "SET") {
        if (rest.includes("NX") && store.has(k)) return { result: null };
        store.set(k, v);
        return { result: "OK" };
      }
      if (cmd === "INCR") {
        const n = Number(store.get(k) ?? 0) + 1;
        store.set(k, String(n));
        return { result: n };
      }
      return { error: "comando desconhecido" };
    });
    return new Response(JSON.stringify(out), { status: 200 });
  };
  return { impl, calls };
}

async function withFetch(impl, fn) {
  const real = globalThis.fetch;
  globalThis.fetch = impl;
  try {
    await fn();
  } finally {
    globalThis.fetch = real;
    clearEnv();
  }
}

test("memória: guarda, lê e expira", async () => {
  clearEnv();
  __resetMemory();
  await kvSet("a", { x: 1 }, 60);
  assert.deepEqual(await kvGet("a"), { x: 1 });
  assert.equal(await kvGet("nao-existe"), null);
  await kvSet("curto", "v", 1);
  await new Promise((r) => setTimeout(r, 1100));
  assert.equal(await kvGet("curto"), null);
});

test("memória: contador soma de 1 em 1 e cada chave tem o seu", async () => {
  clearEnv();
  __resetMemory();
  assert.equal(await kvIncr("c", 60), 1);
  assert.equal(await kvIncr("c", 60), 2);
  assert.equal(await kvIncr("c", 60), 3);
  assert.equal(await kvIncr("outro", 60), 1);
});

test("Redis: usa o endpoint certo, manda o token e grava com expiração", async () => {
  const { impl, calls } = fakeRedis();
  await withFetch(impl, async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://exemplo.upstash.io/";
    process.env.UPSTASH_REDIS_REST_TOKEN = "segredo-teste";
    __resetMemory();
    await kvSet("k", { a: 1 }, 30);
    assert.deepEqual(await kvGet("k"), { a: 1 });
    assert.equal(await kvIncr("n", 60), 1);
    assert.equal(await kvIncr("n", 60), 2);
    assert.ok(calls.length >= 4);
    assert.ok(calls.every((c) => c.url === "https://exemplo.upstash.io/pipeline"));
    assert.ok(calls.every((c) => c.auth === "Bearer segredo-teste"));
    assert.ok(calls.some((c) => c.cmds[0][0] === "SET" && c.cmds[0].includes("EX")));
  });
});

test("Redis: se o servidor cair, nada quebra e cai para a memória", async () => {
  const { impl } = fakeRedis({ fail: true });
  await withFetch(impl, async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://exemplo.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "segredo-teste";
    __resetMemory();
    assert.equal(await kvIncr("queda", 60), 1);
    assert.equal(await kvIncr("queda", 60), 2);
    await kvSet("m", "ok", 30);
    assert.equal(await kvGet("m"), "ok");
  });
});

test("Redis: recusa URL sem https (o token nunca vai em texto aberto)", async () => {
  const { impl, calls } = fakeRedis();
  await withFetch(impl, async () => {
    process.env.UPSTASH_REDIS_REST_URL = "http://exemplo.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "segredo-teste";
    __resetMemory();
    await kvSet("k", 1, 30);
    assert.equal(await kvGet("k"), 1, "funciona pela memória");
    assert.equal(calls.length, 0, "não chamou o servidor");
  });
});
