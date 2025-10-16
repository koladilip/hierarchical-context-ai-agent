// src/api/middleware/auth.ts
/**
 * JWT authentication middleware for Cognito
 */
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

const COGNITO_REGION = process.env.AWS_REGION || 'us-east-1';
const COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID || '';
const COGNITO_ISSUER = `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/${COGNITO_USER_POOL_ID}`;

// JWKS client for Cognito public keys
const client = jwksClient({
  jwksUri: `${COGNITO_ISSUER}/.well-known/jwks.json`,
  cache: true,
  cacheMaxAge: 600000, // 10 minutes
});

function getKey(header: any, callback: any) {
  client.getSigningKey(header.kid, (err, key) => {
    if (err) {
      callback(err);
    } else {
      const signingKey = key?.getPublicKey();
      callback(null, signingKey);
    }
  });
}

export interface AuthRequest extends Request {
  user?: {
    sub: string;
    email?: string;
    [key: string]: any;
  };
}

export async function auth(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing or invalid authorization header' });
      return;
    }

    const token = authHeader.split(' ')[1];

    // Verify token
    jwt.verify(
      token,
      getKey,
      {
        issuer: COGNITO_ISSUER,
        audience: process.env.COGNITO_APP_CLIENT_ID,
      },
      (err, decoded) => {
        if (err) {
          res.status(401).json({ error: 'Invalid token', message: err.message });
          return;
        }

        // Attach user to request
        req.user = decoded as any;
        next();
      }
    );
  } catch (error) {
    console.error('Auth error:', error);
    res.status(401).json({ error: 'Authentication failed' });
  }
}

