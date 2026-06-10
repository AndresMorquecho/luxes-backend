import dotenv from 'dotenv';

dotenv.config();

const parseCorsOrigins = (value) => {
  if (!value) return ['http://localhost:5173'];
  return value.split(',').map((origin) => origin.trim()).filter(Boolean);
};

export const env = {
  port: Number(process.env.PORT) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'luxes-dev-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  corsOrigin: parseCorsOrigins(process.env.CORS_ORIGIN),
};
