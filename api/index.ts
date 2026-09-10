import defaultApp from '../server/app';

// Vercel serverless function entry point
export default function handler(req: any, res: any) {
  return defaultApp(req, res);
}

