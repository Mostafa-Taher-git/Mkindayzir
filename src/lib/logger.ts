import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  timestamp: process.env.LOG_FORMAT === 'json'
    ? undefined
    : () => `,"time":"${new Date().toISOString()}"`,
});

export default logger;
