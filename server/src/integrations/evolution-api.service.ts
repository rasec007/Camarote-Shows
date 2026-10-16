export class EvolutionApiService {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly instance: string;

  constructor() {
    this.baseUrl = process.env.EVOLUTION_API_URL?.trim().replace(/\/+$/, "") ?? "";
    this.apiKey = process.env.EVOLUTION_API_KEY?.trim() ?? "";
    this.instance = process.env.EVOLUTION_INSTANCE?.trim() ?? "";
  }

  async sendText(number: string, text: string): Promise<void> {
    if (!this.baseUrl || !this.apiKey || !this.instance) {
      throw new Error("Evolution API não configurada. Defina URL, chave e instância no ambiente.");
    }

    let recipient = number.replace(/\D/g, "");
    // Local registrations use Brazilian DDD + phone; Evolution expects DDI too.
    if (!number.trim().startsWith("+") && (recipient.length === 10 || recipient.length === 11)) recipient = `55${recipient}`;
    if (!/^[1-9]\d{9,14}$/.test(recipient)) {
      throw new Error("Celular / WhatsApp inválido. Informe o DDD e o número; para outros países, inclua + e o DDI.");
    }

    const response = await fetch(`${this.baseUrl}/message/sendText/${encodeURIComponent(this.instance)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: this.apiKey },
      body: JSON.stringify({ number: recipient, text }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new Error(`Evolution API retornou HTTP ${response.status}.`);
    }
  }
}
