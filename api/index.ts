import type { Request, Response } from 'express';
import app from '../server/app.js';

export default function handler(req: Request, res: Response) {
  const incoming = new URL(req.url || '/api/index', 'http://localhost');
  const route = incoming.searchParams.get('route');
  incoming.searchParams.delete('route');
  const suffix = incoming.searchParams.toString();
  const routePath = String(route || '').replace(/^\/+/, '');
  req.url = `/api/${routePath}${suffix ? `?${suffix}` : ''}`;
  return app(req, res);
}
