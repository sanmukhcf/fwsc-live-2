import defaultApp from '../server/app';

// Vercel serverless function entry point
export default async function handler(req: any, res: any) {
  // Normalize URL if Vercel rewrites passed the route path in req.query['0'] or headers
  try {
    if (req.query && req.query['0']) {
      const subPath = String(req.query['0']).replace(/^\/+/, '');
      req.url = '/api/' + subPath;
    } else if (req.headers && req.headers['x-forwarded-uri']) {
      req.url = req.headers['x-forwarded-uri'];
    }
  } catch {
    // Non-fatal, use existing req.url
  }

  // Ensure response ends cleanly and errors are captured without unhandled crashes
  return new Promise<void>((resolve) => {
    let resolved = false;
    const safeResolve = () => {
      if (!resolved) {
        resolved = true;
        resolve();
      }
    };

    res.once('finish', safeResolve);
    res.once('close', safeResolve);

    try {
      defaultApp(req, res);
    } catch (err: any) {
      console.error('Vercel serverless invocation error:', err);
      if (!res.headersSent) {
        res.setHeader('Content-Type', 'application/json');
        res.statusCode = 500;
        res.end(
          JSON.stringify({
            error: err?.message || 'Internal audit processing error.',
            errorDetails: {
              type: 'server_error',
              errorType: 'Audit Service Error',
              reason: 'SERVERLESS_HANDLER_ERROR',
              message: err?.message || 'The audit server encountered an unexpected error.',
              url: req.url || '',
              statusCode: 500,
              canRetry: true,
            },
          })
        );
      }
      safeResolve();
    }
  });
}


