export type HealthResponse = { ok: boolean; env?: string };
export type LoginResponse = { access_token: string; token_type?: string };

export type KpisPayload = {
  org: { id: string; name: string };
  kpis: {
    ca_real_eur: number;
    ca_pred_eur: number;
    mape: number;
    mae: number;
  };
  updated_at: string;
};

export type Site = {
  id: string;
  name: string;
  address: string;
  surface_m2?: number | null;
  category?: string | null;
  hours_json?: string | null;
};

export type ImportErrorPreview = {
  row: number;
  error: string;
};

export type ImportCaResponse = {
  batch_id: string;
  filename: string;
  type?: string;
  status: string;
  rows_total: number;
  rows_ok: number;
  rows_duplicated: number;
  rows_failed: number;
  errors_preview?: ImportErrorPreview[];
};

export type ImportBatch = {
  id: string;
  type: string;
  filename: string;
  status: string;
  rows_total: number;
  rows_ok: number;
  rows_duplicated: number;
  rows_failed: number;
};

export type TrainResponse = {
  model_run_id: string;
  site_id: string;
  model_name: string;
  train_rows: number;
  mae: number;
  mape: number;
};

export type ForecastWeather = {
  temp_c?: number | null;
  rain_mm?: number | null;
  source?: string | null;
};

export type ForecastPoint = {
  day: string;
  predicted_revenue_eur: number;
  weather?: ForecastWeather;
};

export type ForecastPayload = {
  site_id: string;
  site_name: string;
  horizon_days: number;
  model_run: {
    id: string;
    model_name: string;
    train_rows: number;
    mae: number;
    mape: number;
    features: string[];
  };
  forecast: ForecastPoint[];
  sum_predicted_eur: number;
};
export type BacktestRow = {
  day: string;
  real: number;
  pred: number;
  error: number;
};

export type BacktestPayload = {
  site_id: string;
  horizon_days: number;
  mae: number;
  mape: number;
  rows: BacktestRow[];
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

function authHeaders(token?: string): HeadersInit {
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json() as Promise<T>;
}

async function postCsv(token: string, endpoint: string, file: File): Promise<ImportCaResponse> {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch(`${API_BASE}${endpoint}`, {
    method: "POST",
    headers: authHeaders(token),
    body: form,
  });
  return parseJson<ImportCaResponse>(response);
}

export async function getHealth(): Promise<HealthResponse> {
  const response = await fetch(`${API_BASE}/health`, { cache: "no-store" });
  return parseJson<HealthResponse>(response);
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const response = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return parseJson<LoginResponse>(response);
}

export async function apiLogin(email: string, password: string): Promise<LoginResponse> {
  return login(email, password);
}

export async function apiKpis(token: string): Promise<KpisPayload> {
  const response = await fetch(`${API_BASE}/api/kpis`, {
    headers: authHeaders(token),
    cache: "no-store",
  });
  return parseJson<KpisPayload>(response);
}

export async function getSites(token: string): Promise<Site[]> {
  const response = await fetch(`${API_BASE}/api/sites`, {
    headers: authHeaders(token),
    cache: "no-store",
  });
  return parseJson<Site[]>(response);
}

export async function apiSites(token: string): Promise<Site[]> {
  return getSites(token);
}

export async function createSite(
  token: string,
  payload: {
    name: string;
    address: string;
    surface_m2?: number;
    category?: string;
    hours_json?: string;
  }
): Promise<Site> {
  const response = await fetch(`${API_BASE}/api/sites`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(token),
    },
    body: JSON.stringify(payload),
  });
  return parseJson<Site>(response);
}

export async function apiCreateSite(
  token: string,
  payload: {
    name: string;
    address: string;
    surface_m2?: number;
    category?: string;
    hours_json?: string;
  }
): Promise<Site> {
  return createSite(token, payload);
}

export async function importCaCsv(token: string, file: File): Promise<ImportCaResponse> {
  return postCsv(token, "/api/import/ca", file);
}

export async function apiImportCa(token: string, file: File): Promise<ImportCaResponse> {
  return importCaCsv(token, file);
}

export async function importWeatherCsv(token: string, file: File): Promise<ImportCaResponse> {
  return postCsv(token, "/api/import/weather", file);
}

export async function importTrafficCsv(token: string, file: File): Promise<ImportCaResponse> {
  return postCsv(token, "/api/import/traffic", file);
}

export async function importStaffingCsv(token: string, file: File): Promise<ImportCaResponse> {
  return postCsv(token, "/api/import/staffing", file);
}

export async function importEventsCsv(token: string, file: File): Promise<ImportCaResponse> {
  return postCsv(token, "/api/import/events", file);
}

export async function getImports(token: string): Promise<ImportBatch[]> {
  const response = await fetch(`${API_BASE}/api/imports`, {
    headers: authHeaders(token),
    cache: "no-store",
  });
  return parseJson<ImportBatch[]>(response);
}

export async function apiImports(token: string): Promise<ImportBatch[]> {
  return getImports(token);
}

export async function trainModel(token: string, site_id: string): Promise<TrainResponse> {
  const response = await fetch(`${API_BASE}/api/model/train`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify({ site_id }),
  });
  return parseJson<TrainResponse>(response);
}

export async function forecast(
  token: string,
  site_id: string,
  horizon_days: 7 | 30,
  model_run_id?: string
): Promise<ForecastPayload> {
  const params = new URLSearchParams({
    site_id,
    horizon_days: String(horizon_days),
  });

  if (model_run_id) {
    params.set("model_run_id", model_run_id);
  }

  const response = await fetch(`${API_BASE}/api/forecast?${params.toString()}`, {
    headers: authHeaders(token),
    cache: "no-store",
  });
  return parseJson<ForecastPayload>(response);
}
export async function backtest(
  token: string,
  site_id: string,
  horizon_days: 7 | 30
): Promise<BacktestPayload> {
  const params = new URLSearchParams({
    site_id,
    horizon_days: String(horizon_days),
  });

  const response = await fetch(
    `${API_BASE}/api/backtest?${params.toString()}`,
    {
      headers: authHeaders(token),
      cache: "no-store",
    }
  );

  return parseJson<BacktestPayload>(response);
}