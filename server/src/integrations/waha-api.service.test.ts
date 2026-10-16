import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { WahaApiService } from "./waha-api.service.js";

function configure(t: TestContext) {
  const config = { WAHA_API_URL: " https://waha.example.test/// ", WAHA_API_KEY: " test-key ", WAHA_SESSION: " teste/local " };
  for (const [key, value] of Object.entries(config)) {
    const previous = process.env[key];
    process.env[key] = value;
    t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; });
  }
}

test("envia para WAHA usando chatId, sessão e chave corretos", async (t) => {
  configure(t);
  const send = t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    assert.equal(url, "https://waha.example.test/api/sendText");
    assert.equal(init.method, "POST");
    assert.equal((init.headers as Record<string, string>)["X-Api-Key"], "test-key");
    assert.deepEqual(JSON.parse(String(init.body)), { session: "teste/local", chatId: "551199990000@c.us", text: "Link de acesso de teste" });
    return new Response(null, { status: 201 });
  });
  await new WahaApiService().sendText("(11) 99999-0000", "Link de acesso de teste");
  assert.equal(send.mock.callCount(), 1);
});

test("aceita URL com /api e mantém números internacionais", async (t) => {
  configure(t);
  process.env.WAHA_API_URL = "https://waha.example.test/api/";
  const send = t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    assert.equal(url, "https://waha.example.test/api/sendText");
    assert.equal(JSON.parse(String(init.body)).chatId, "12025550123@c.us");
    return new Response(null, { status: 200 });
  });
  await new WahaApiService().sendText("+1 (202) 555-0123", "Teste");
  assert.equal(send.mock.callCount(), 1);
});

test("remove o nono dígito de celulares brasileiros, inclusive quando já vêm com DDI", async (t) => {
  configure(t);
  const chatIds: string[] = [];
  t.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
    chatIds.push(JSON.parse(String(init.body)).chatId);
    return new Response(null, { status: 200 });
  });

  await new WahaApiService().sendText("85988584800", "Teste local");
  await new WahaApiService().sendText("+55 85 98858-4800", "Teste internacional BR");

  assert.deepEqual(chatIds, ["558588584800@c.us", "558588584800@c.us"]);
});

test("recusa número inválido e configuração ausente antes de chamar WAHA", async (t) => {
  configure(t);
  const send = t.mock.method(globalThis, "fetch", async () => new Response(null, { status: 201 }));
  await assert.rejects(new WahaApiService().sendText("sem telefone", "Teste"), /WhatsApp inválido/);
  delete process.env.WAHA_API_KEY;
  await assert.rejects(new WahaApiService().sendText("11999990000", "Teste"), /WAHA não configurado/);
  assert.equal(send.mock.callCount(), 0);
});

test("sinaliza erro HTTP da WAHA sem expor a chave", async (t) => {
  configure(t);
  t.mock.method(globalThis, "fetch", async () => new Response(null, { status: 401 }));
  await assert.rejects(new WahaApiService().sendText("11999990000", "Teste"), { message: "WAHA retornou HTTP 401." });
});
