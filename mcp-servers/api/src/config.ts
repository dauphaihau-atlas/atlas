export interface BackendMcpConfig {
  backendPath: string;
  phpContainer: string;
  postgres: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
  };
}

function loadConfig(): BackendMcpConfig {
  const backendPath = process.env.ATLAS_BACKEND_PATH;
  if (!backendPath) {
    throw new Error('Missing required environment variable: ATLAS_BACKEND_PATH');
  }

  const pgPassword = process.env.POSTGRES_PASSWORD;
  if (!pgPassword) {
    throw new Error('Missing required environment variable: POSTGRES_PASSWORD');
  }

  return Object.freeze({
    backendPath: backendPath.replace(/\/$/, ''),
    phpContainer: process.env.ATLAS_PHP_CONTAINER ?? 'atlas-php-1',
    postgres: {
      host:     process.env.POSTGRES_HOST     ?? 'localhost',
      port:     parseInt(process.env.POSTGRES_PORT ?? '5432', 10),
      database: process.env.POSTGRES_DB       ?? 'atlas',
      user:     process.env.POSTGRES_USER     ?? 'laravel',
      password: pgPassword,
    },
  });
}

export const config = loadConfig();
