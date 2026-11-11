import { Request, Response, NextFunction } from 'express';
import { config } from '../config/env';
import { initializeFirebase } from '../config/firebase';

export async function forwardToCloudApiIfLocalMock(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const { isMockMode } = initializeFirebase();
  const isProxyDisabled = process.env.DISABLE_CLOUD_PROXY === 'true';
  const hasExplicitMockHeader = Boolean(req.headers['x-mock-role']);

  if (!isMockMode || isProxyDisabled || hasExplicitMockHeader) {
    return next();
  }

  // Only proxy /api/* and /api/v1/* API paths except local health status
  if (req.originalUrl.startsWith('/api/v1/health')) {
    return next();
  }

  // Avoid proxying pure stateless Razorpay unit checks if no booking/auth token attached so local Express test works standalone even offline
  if (
    (req.originalUrl === '/api/create-order' || req.originalUrl === '/api/verify-payment') &&
    !req.headers.authorization &&
    !req.body?.bookingId &&
    !req.body?.settlementId
  ) {
    return next();
  }

  const baseUrl = config.cloudFunctionsApiUrl.replace(/\/+$/, '');
  const mappedPath =
    req.originalUrl === '/api/create-order'
      ? '/api/v1/payments/create-order'
      : req.originalUrl === '/api/verify-payment'
      ? '/api/v1/payments/verify-payment'
      : req.originalUrl;
  const targetUrl = `${baseUrl}${mappedPath}`;

  try {
    const forwardHeaders: Record<string, string> = {
      Accept: 'application/json',
    };
    if (req.headers['content-type']) {
      forwardHeaders['Content-Type'] = String(req.headers['content-type']);
    } else if (!['GET', 'HEAD'].includes(req.method.toUpperCase())) {
      forwardHeaders['Content-Type'] = 'application/json';
    }
    if (req.headers.authorization) {
      forwardHeaders.Authorization = String(req.headers.authorization);
    }
    if (req.headers['x-client-platform']) {
      forwardHeaders['X-Client-Platform'] = String(req.headers['x-client-platform']);
    }
    if (req.headers.origin) {
      forwardHeaders['X-Forwarded-Origin'] = String(req.headers.origin);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);

    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers: forwardHeaders,
      body:
        ['GET', 'HEAD'].includes(req.method.toUpperCase()) || req.body === undefined
          ? undefined
          : JSON.stringify(req.body),
      signal: controller.signal,
    });
    clearTimeout(timer);

    const rawText = await upstream.text();
    res.status(upstream.status);
    try {
      const parsed = JSON.parse(rawText);
      res.json(parsed);
    } catch {
      res.type(upstream.headers.get('content-type') || 'text/plain').send(rawText);
    }
    return;
  } catch (err) {
    console.warn(
      `Cloud API proxy skipped for ${req.method} ${req.originalUrl}, falling back to local handler:`,
      err instanceof Error ? err.message : err
    );
    return next();
  }
}

