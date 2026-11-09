import { createApp } from './app';
import { config } from './config/env';
import { initializeFirebase } from './config/firebase';

const app = createApp();

// Attempt Firebase initialization (will run in Mock Mode if no credentials present)
initializeFirebase();

const server = app.listen(config.port, () => {
  console.log(`====================================================`);
  console.log(` Diagnostic Logistics Backend API Server Started`);
  console.log(` Mode:        ${config.env}`);
  console.log(` Port:        ${config.port}`);
  console.log(` Health:      http://localhost:${config.port}/api/v1/health`);
  console.log(` Orders:      http://localhost:${config.port}/api/v1/orders`);
  console.log(`====================================================`);
});

// Graceful shutdown handling
function gracefulShutdown(signal: string) {
  console.log(`\nReceived ${signal}. Shutting down gracefully...`);
  server.close(() => {
    console.log('Backend HTTP server closed.');
    process.exit(0);
  });
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
