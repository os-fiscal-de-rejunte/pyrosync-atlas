export async function getData<T>(path: string, params: Record<string, string | number | undefined>, signal?: AbortSignal): Promise<T> {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') query.set(key, String(value));
  });
  return request<T>(`${path}?${query.toString()}`, { signal });
}

export async function postData<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

async function request<T>(path: string, options: RequestInit): Promise<T> {
  const response = await fetch(path, options);
  if (!response.ok) {
    let message = 'Não foi possível carregar os dados. Tente novamente.';
    try {
      const result = await response.json();
      if (typeof result.detail === 'string') message = result.detail;
    } catch { /* resposta não estruturada */ }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export function dateUtc(daysAgo = 0): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

export function dateLabel(value?: string | null): string {
  if (!value) return '—';
  const short = value.slice(0, 10).split('-');
  return short.length === 3 ? `${short[2]}/${short[1]}/${short[0]}` : value;
}

export function numberLabel(value: number): string {
  return new Intl.NumberFormat('pt-BR').format(value);
}

export function percentLabel(value: number | null | undefined): string {
  return value == null ? 'Indisponível' : `${(value * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
}
