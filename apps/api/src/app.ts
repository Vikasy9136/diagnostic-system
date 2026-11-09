import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config/env';
import { healthRouter } from './routes/health.routes';
import { ordersRouter } from './routes/orders.routes';
import { errorHandler, AppError } from './middleware/errorHandler';

export function createApp(): Application {
  const app = express();

  // Security & Utility Middleware
  app.use(helmet());
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
        if (!origin) return callback(null, true);
        if (config.corsOrigin.includes(origin) || config.corsOrigin.includes('*')) {
          return callback(null, true);
        }
        return callback(null, true); // Permissive in local development
      },
      credentials: true,
    })
  );
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // API Routes
  app.use('/api/v1/health', healthRouter);
  app.use('/api/v1/orders', ordersRouter);

  // 404 Not Found Handler
  app.use((req: Request, _res: Response, next: NextFunction) => {
    next(new AppError(`Endpoint not found: ${req.method} ${req.originalUrl}`, 404, 'NOT_FOUND'));
  });

  // Global Error Handler
  app.use(errorHandler);

  return app;
}

