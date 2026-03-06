export type HealthResponse = {
  ok: boolean;
  env: string;
};

export type LoginResponse = {
  access_token: string;
  token_type: string;
};

export type OrgInfo = {
  id: number | string;
  name: string;
};

export type KpisPayload = {
  org: OrgInfo;
  kpis: {
    ca_real_eur: number;
    ca_pred_eur: number;
    mape: number;
    mae: number;
  };
  updated_at: string;
};

export type Site = {
  id: number | string;
  name: string;
  address: string;
  surface_m2?: number | null;
  category?: string | null;
  hours_json?: string | null;
};

export type CreateSiteInput = {
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
  batch_id: number | string;
  filename: string;
  status: string;
  rows_total: number;
  rows_ok: number;
  rows_duplicated: number;
  rows_failed: number;
  errors_preview: ImportErrorPreview[];
};

export type ImportBatch = {
  id: number | string;
  type: string;
  filename: string;
  status: string;
  rows_total: number;
  rows_ok: number;
  rows_duplicated: number;
  rows_failed: number;
};

function getApiBase(base?: string) {
  return base || process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";
}

async function readJsonOrThrow<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return (await response.json()) as T;
}

function authHeaders(token: string, extra?: HeadersInit): HeadersInit {
  return {
    Authorization: "Bearer " + token,
    ...(extra || {}),
  };
}

export async function getHealth(base?: string): Promise<HealthResponse> {
  const response = await fetch(getApiBase(base) + "/health");
  return readJsonOrThrow<HealthResponse>(response);
}

export async function apiLogin(email: string, password: string, base?: string): Promise<LoginResponse> {
  const response = await fetch(getApiBase(base) + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return readJsonOrThrow<LoginResponse>(response);
}

export async function apiKpis(token: string, base?: string): Promise<KpisPayload> {
  const response = await fetch(getApiBase(base) + "/api/kpis", {
    headers: authHeaders(token),
  });
  return readJsonOrThrow<KpisPayload>(response);
}

export async function apiSites(token: string, base?: string): Promise<Site[]> {
  const response = await fetch(getApiBase(base) + "/api/sites", {
    headers: authHeaders(token),
  });
  return readJsonOrThrow<Site[]>(response);
}

export async function apiCreateSite(
  token: string,
  payload: CreateSiteInput,
  base?: string
): Promise<Site> {
  const response = await fetch(getApiBase(base) + "/api/sites", {
    method: "POST",
    headers: authHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  return readJsonOrThrow<Site>(response);
}

export async function apiImportCa(
  token: string,
  file: File,
  base?: string
): Promise<ImportCaResponse> {
  const form = new FormData();
  form.append("file", file);

  const response = await fetch(getApiBase(base) + "/api/import/ca", {
    method: "POST",
    headers: authHeaders(token),
    body: form,
  });
  return readJsonOrThrow<ImportCaResponse>(response);
}

export async function apiImports(token: string, base?: string): Promise<ImportBatch[]> {
  const response = await fetch(getApiBase(base) + "/api/imports", {
    headers: authHeaders(token),
  });
  return readJsonOrThrow<ImportBatch[]>(response);
}