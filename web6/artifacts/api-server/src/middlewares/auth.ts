import type { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../lib/supabaseAdmin.js';

// ---------------------------------------------------------------------------
// Augment Express request with authenticated user info
// ---------------------------------------------------------------------------
export interface AuthenticatedRequest extends Request {
  authUser: {
    id: string;   // Supabase auth UID (uuid)
    email: string;
  };
}

// ---------------------------------------------------------------------------
// requireAuth middleware — verifies Supabase JWT
// ---------------------------------------------------------------------------
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const { data: { user }, error } = await supabaseAdmin().auth.getUser(token);

    if (error || !user) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    (req as AuthenticatedRequest).authUser = {
      id: user.id,
      email: user.email ?? '',
    };

    next();
  } catch {
    res.status(500).json({ error: 'Auth service unavailable' });
  }
}

// ---------------------------------------------------------------------------
// requireAdmin middleware — must be used AFTER requireAuth in a chain
// ---------------------------------------------------------------------------
export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await new Promise<void>((resolve) => {
    requireAuth(req, res, () => resolve());
  });

  if (res.headersSent) return;

  const authReq = req as AuthenticatedRequest;

  try {
    const { data: profile } = await supabaseAdmin()
      .from('profiles')
      .select('role')
      .eq('auth_user_id', authReq.authUser.id)
      .single();

    if (profile?.role !== 'admin') {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    next();
  } catch {
    res.status(500).json({ error: 'Failed to verify permissions' });
  }
}
