/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_ENDPOINT: string;
  readonly VITE_USER_POOL_ID: string;
  readonly VITE_APP_CLIENT_ID: string;
  readonly VITE_COGNITO_DOMAIN: string;
  readonly VITE_REGION: string;
  readonly VITE_CLOUDFRONT_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

