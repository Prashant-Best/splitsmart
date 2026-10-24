import pino from 'pino';
import { config } from './config';

export const logger = pino({
  level: config.logLevel,
  // Session cookies and tokens never reach the logs.
  redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
  ...(config.env === 'development'
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
        },
      }
    : {}),
});
