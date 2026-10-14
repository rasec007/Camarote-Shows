export class EvolutionApiService {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly instance: string;

  constructor() {
    this.baseUrl = process.env.EVOLUTION_API_URL?.replace(/\/$/, "") ?? "";
    this.apiKey = process.env.EVOLUTION_API_KEY ?? "";
    this.instance = process.env.EVOLUTION_INSTANCE ?? "";
  }

  async sendText(number: string, text: string): Promise<void> {
    if (!this.baseUrl || !this.apiKey || !this.instance) {
      throw new Error("Evolution API não configurada. Defina URL, chave e instância no ambiente.");
    }

    const response = await fetch(`${this.baseUrl}/message/sendText/${encodeURIComponent(this.instance)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: this.apiKey },
      body: JSON.stringify({ number: number.replace(/\D/g, ""), text }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new Error(`Evolution API retornou HTTP ${response.status}.`);
    }
  }
}
