import { createClient } from '@supabase/supabase-js';
import type { Request, Response, NextFunction } from 'express';

// ---------------------------------------------------------------------------
// Supabase admin client — used only for JWT verification via getUser()
// ---------------------------------------------------------------------------
function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in the environment',
    );
  }

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// Lazy singleton — created on first use so startup doesn't crash when env
// vars are temporarily missing during local hot-reload.
let _admin: ReturnType<typeof getSupabaseAdmin> | null = null;
function supabaseAdmin() {
  if (!_admin) _admin = getSupabaseAdmin();
  return _admin;
}

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
// requireAuth middleware
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
    const {
      data: { user },
      error,
    } = await supabaseAdmin().auth.getUser(token);

    if (error || !user) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    (req as AuthenticatedRequest).authUser = {
      id: user.id,
      email: user.email ?? '',
    };

    next();
  } catch (err) {
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
  // First verify the JWT
  await new Promise<void>((resolve) => {
    requireAuth(req, res, () => resolve());
  });

  // If requireAuth already sent a response (401), res.headersSent will be true
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
