import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  iat: number;
  exp: number;
}

/**
 * Verifies Bearer JWT from Authorization header and attaches user to req.user
 */
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;
    req.user = { id: payload.sub, email: payload.email, role: payload.role };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Restricts access to specified roles. Must be used after authenticate.
 *
 * SUPER_ADMIN implicitly satisfies any ADMIN-required check, since SUPER_ADMIN
 * is the top of the role hierarchy (SUPER_ADMIN > ADMIN > AGENT). This avoids
 * touching every existing `requireRole('ADMIN')` callsite when the new role
 * was introduced.
 */
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    const role = req.user.role;
    const allowed =
      roles.includes(role) ||
      (role === 'SUPER_ADMIN' && roles.includes('ADMIN'));
    if (!allowed) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    next();
  };
}
