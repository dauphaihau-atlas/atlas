export interface AtlasConfig {
  apiUrl: string;
  apiToken: string;
  tenantId: string | null;
}

function loadConfig(): AtlasConfig {
  const apiUrl = process.env.ATLAS_API_URL;
  const apiToken = process.env.ATLAS_API_TOKEN;

  if (!apiUrl) {
    throw new Error('Missing required environment variable: ATLAS_API_URL');
  }
  if (!apiToken) {
    throw new Error('Missing required environment variable: ATLAS_API_TOKEN');
  }

  return Object.freeze({
    apiUrl: apiUrl.replace(/\/$/, ''),
    apiToken,
    tenantId: process.env.ATLAS_TENANT_ID || null,
  });
}

export const config = loadConfig();
