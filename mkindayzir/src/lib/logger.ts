// src/lib/logger.ts
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatter: process.env.LOG_FORMAT === 'json' 
    ? undefined 
    : { timestamp: () => `,"time":"${new Date().toISOString()}"` },
});

export default logger;
