import { Router, Request, Response } from 'express';
import { ApiResponse } from '@diagnostic/shared';
import { config } from '../config/env';
import { initializeFirebase } from '../config/firebase';

export const healthRouter = Router();

healthRouter.get('/', (_req: Request, res: Response) => {
  const firebaseStatus = initializeFirebase();

  const response: ApiResponse<{
    status: string;
    environment: string;
    uptimeSeconds: number;
    nodeVersion: string;
    firebaseProjectId: string;
    firebaseConnected: boolean;
    isMockMode: boolean;
    adminEmail: string;
    smtpConfigured: boolean;
  }> = {
    success: true,
    data: {
      status: 'HEALTHY',
      environment: config.env,
      uptimeSeconds: Math.floor(process.uptime()),
      nodeVersion: process.version,
      firebaseProjectId: config.firebase.projectId,
      firebaseConnected: !firebaseStatus.isMockMode,
      isMockMode: firebaseStatus.isMockMode,
      adminEmail: config.admin.email,
      smtpConfigured: Boolean(config.smtp.pass),
    },
    message: 'Diagnostic Logistics Backend API is operational',
    timestamp: new Date().toISOString(),
  };

  res.json(response);
});
