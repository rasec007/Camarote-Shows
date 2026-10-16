export class WahaApiService {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly session: string;

  constructor() {
    this.baseUrl = process.env.WAHA_API_URL?.trim().replace(/\/+$/, "") ?? "";
    this.apiKey = process.env.WAHA_API_KEY?.trim() ?? "";
    this.session = process.env.WAHA_SESSION?.trim() || "default";
  }

  async sendText(number: string, text: string): Promise<void> {
    if (!this.baseUrl || !this.apiKey) {
      throw new Error("WAHA não configurado. Defina WAHA_API_URL e WAHA_API_KEY no ambiente.");
    }

    let recipient = number.replace(/\D/g, "");
    if (!number.trim().startsWith("+") && (recipient.length === 10 || recipient.length === 11)) recipient = `55${recipient}`;

    // WAHA expects Brazilian mobile JIDs without the ninth digit after the DDD.
    if (/^55\d{2}9\d{8}$/.test(recipient)) {
      recipient = `${recipient.slice(0, 4)}${recipient.slice(5)}`;
    }

    if (!/^[1-9]\d{9,14}$/.test(recipient)) {
      throw new Error("Celular / WhatsApp inválido. Informe o DDD e o número; para outros países, inclua + e o DDI.");
    }

    const apiRoot = this.baseUrl.endsWith("/api") ? this.baseUrl : `${this.baseUrl}/api`;
    const response = await fetch(`${apiRoot}/sendText`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": this.apiKey },
      body: JSON.stringify({ session: this.session, chatId: `${recipient}@c.us`, text }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) throw new Error(`WAHA retornou HTTP ${response.status}.`);
  }
}
