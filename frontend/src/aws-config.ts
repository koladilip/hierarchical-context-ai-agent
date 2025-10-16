// frontend/src/aws-config.ts
/**
 * AWS Amplify configuration
 * Update these values after deployment
 */

export const awsConfig = {
  Auth: {
    Cognito: {
      userPoolId: import.meta.env.VITE_USER_POOL_ID || 'us-east-1_NI1wp1Avk',
      userPoolClientId: import.meta.env.VITE_APP_CLIENT_ID || '6hld73bqgdq36n53hgbj0dkaf9',
      loginWith: {
        email: true,
        oauth: {
          domain: import.meta.env.VITE_COGNITO_DOMAIN || 'lyzr-agent-237139758061.auth.us-east-1.amazoncognito.com',
          scopes: [
            'email',
            'profile',
            'openid',
          ],
          redirectSignIn: [
            'http://localhost:3000',
            import.meta.env.VITE_CLOUDFRONT_URL || window.location.origin,
          ],
          redirectSignOut: [
            'http://localhost:3000',
            import.meta.env.VITE_CLOUDFRONT_URL || window.location.origin,
          ],
          responseType: 'code' as const,
        },
      },
      signUpVerificationMethod: 'code' as const,
      userAttributes: {
        email: {
          required: true,
        },
      },
      passwordFormat: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireNumbers: true,
        requireSpecialCharacters: false,
      },
    },
  },
};

// Use local backend in development, deployed API in production
// Priority: VITE_API_ENDPOINT env var > MODE check > default
export const API_ENDPOINT = 
  import.meta.env.VITE_API_ENDPOINT || 
  (import.meta.env.MODE === 'development' ? 'http://localhost:3001' : 'https://your-api.execute-api.us-east-1.amazonaws.com');

// Log API endpoint on app load (helps debug)
console.log('🔧 API Configuration:', {
  endpoint: API_ENDPOINT,
  mode: import.meta.env.MODE,
  explicitEndpoint: import.meta.env.VITE_API_ENDPOINT || 'not set',
});

