import { NextApiRequest, NextApiResponse } from 'next';

export function authWrite(req: NextApiRequest, res: NextApiResponse): boolean {
  const key = req.headers['x-api-key'];
  const expected = process.env.API_WRITE_KEY;

  if (!key || key !== expected) {
    res.status(401).json({ error: 'unauthorized' });
    return false;
  }
  return true;
}
