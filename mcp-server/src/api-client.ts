export class OrgaLifeApiClient {
  private baseUrl: string;

  constructor() {
    this.baseUrl = process.env.ORGALIFE_API_URL || "http://localhost:3000";
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    try {
      const response = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
          `API ${method} ${path} returned ${response.status}: ${errorBody}`
        );
      }

      return response.json() as Promise<T>;
    } catch (error) {
      if (
        error instanceof TypeError &&
        (error.message.includes("fetch") ||
          error.message.includes("ECONNREFUSED"))
      ) {
        throw new Error(
          `No se puede conectar a OrgaLife en ${this.baseUrl}. ` +
            `Asegurate de que el servidor Next.js esté corriendo (cd orgalife && npm run dev).`
        );
      }
      throw error;
    }
  }

  get<T>(path: string) {
    return this.request<T>("GET", path);
  }
  post<T>(path: string, body: unknown) {
    return this.request<T>("POST", path, body);
  }
  patch<T>(path: string, body: unknown) {
    return this.request<T>("PATCH", path, body);
  }
  delete<T>(path: string) {
    return this.request<T>("DELETE", path);
  }
}
