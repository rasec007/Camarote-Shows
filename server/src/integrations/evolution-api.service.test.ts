import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { EvolutionApiService } from "./evolution-api.service.js";

function configure(t: TestContext) {
  const config = { EVOLUTION_API_URL: " https://evolution.example.test/// ", EVOLUTION_API_KEY: " test-key ", EVOLUTION_INSTANCE: " teste / local " };
  for (const [key, value] of Object.entries(config)) {
    const previous = process.env[key];
    process.env[key] = value;
    t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; });
  }
}

test("envia números locais e internacionais pelo endpoint da Evolution", async (t) => {
  configure(t);
  let expected = "";
  const send = t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    assert.equal(url, "https://evolution.example.test/message/sendText/teste%20%2F%20local");
    assert.equal(init.method, "POST");
    assert.equal((init.headers as Record<string, string>).apikey, "test-key");
    assert.deepEqual(JSON.parse(String(init.body)), { number: expected, text: "Link de acesso de teste" });
    return new Response(null, { status: 201 });
  });
  for (const [input, recipient] of [
    ["(11) 99999-0000", "5511999990000"],
    ["(11) 3333-0000", "551133330000"],
    ["+55 (11) 99999-0000", "5511999990000"],
    ["5511999990000", "5511999990000"],
    ["+1 (202) 555-0123", "12025550123"],
  ]) {
    expected = recipient;
    await new EvolutionApiService().sendText(input, "Link de acesso de teste");
  }
  assert.equal(send.mock.callCount(), 5);
});

test("recusa celular inválido antes de chamar a API", async (t) => {
  configure(t);
  const send = t.mock.method(globalThis, "fetch", async () => new Response(null, { status: 201 }));
  await assert.rejects(new EvolutionApiService().sendText("sem telefone", "Teste"), /WhatsApp inválido/);
  assert.equal(send.mock.callCount(), 0);
});

test("informa falha da Evolution sem expor a chave", async (t) => {
  configure(t);
  t.mock.method(globalThis, "fetch", async () => new Response(null, { status: 401 }));
  await assert.rejects(new EvolutionApiService().sendText("11999990000", "Teste"), { message: "Evolution API retornou HTTP 401." });
});

test("recusa envio sem configurar a Evolution", async (t) => {
  configure(t);
  delete process.env.EVOLUTION_API_KEY;
  const send = t.mock.method(globalThis, "fetch", async () => new Response(null, { status: 201 }));
  await assert.rejects(new EvolutionApiService().sendText("11999990000", "Teste"), /Evolution API não configurada/);
  assert.equal(send.mock.callCount(), 0);
});
