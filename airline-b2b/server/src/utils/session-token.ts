import jwt from 'jsonwebtoken';

export const SESSION_ISSUER = 'ado-b2b';
export const SESSION_AUDIENCE = 'ado-b2b-web';

export type SessionClaims = {
  userId: string;
  sessionVersion?: number;
};

export function signSessionToken(claims: SessionClaims, secret: string) {
  return jwt.sign(claims, secret, {
    algorithm: 'HS256',
    issuer: SESSION_ISSUER,
    audience: SESSION_AUDIENCE,
    expiresIn: '8h',
  });
}

export function verifySessionToken(token: string, secret: string): SessionClaims {
  return jwt.verify(token, secret, {
    algorithms: ['HS256'],
    issuer: SESSION_ISSUER,
    audience: SESSION_AUDIENCE,
  }) as SessionClaims;
}
