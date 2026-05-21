import { Request, Response } from 'express';
import { loginUser, registerUser, getUserById } from '../services/auth.service';

export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required' });
    return;
  }

  try {
    const result = await loginUser(String(email), String(password));
    res.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Login failed';
    const code = (error as { code?: string })?.code;
    const status = code === 'ACCOUNT_DISABLED' ? 403 : 401;
    res.status(status).json({ error: message });
  }
}

export async function register(req: Request, res: Response): Promise<void> {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    res.status(400).json({ error: 'Name, email, and password are required' });
    return;
  }

  try {
    const result = await registerUser(String(name), String(email), String(password));
    res.status(201).json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Registration failed';
    const status = message === 'Email already in use' ? 409 : 400;
    res.status(status).json({ error: message });
  }
}

export async function me(req: Request, res: Response): Promise<void> {
  try {
    const user = await getUserById(req.user!.id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json(user);
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
}

export function logout(_req: Request, res: Response): void {
  res.json({ message: 'Logged out successfully' });
}
