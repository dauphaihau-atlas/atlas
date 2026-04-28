export interface DashboardMcpConfig {
  dashboardPath: string;
}

function loadConfig(): DashboardMcpConfig {
  const dashboardPath = process.env.ATLAS_DASHBOARD_PATH;
  if (!dashboardPath) {
    throw new Error('Missing required environment variable: ATLAS_DASHBOARD_PATH');
  }

  return Object.freeze({
    dashboardPath: dashboardPath.replace(/\/$/, ''),
  });
}

export const config = loadConfig();
