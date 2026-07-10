import dotenv from 'dotenv';

dotenv.config();

const parseCorsOrigins = (value?: string): string[] => {
  if (!value) return ['http://localhost:5173'];
  return value.split(',').map((origin) => origin.trim()).filter(Boolean);
};


export const env = {
  port: Number(process.env.PORT) || 4000,
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'luxes-dev-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  corsOrigin: parseCorsOrigins(process.env.CORS_ORIGIN),
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY || '',
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY || '',
  vapidEmail: process.env.VAPID_EMAIL || 'mailto:admin@luxes.com',
  // API de comprobantes electrónicos (SRI - CipherByte)
  sriApiUrl: process.env.SRI_API_URL || 'https://gateway.cipherbyte.ec',
  sriApiKey: process.env.SRI_API_KEY || '',
  sriAmbiente: process.env.SRI_AMBIENTE || '1', // 1=pruebas, 2=producción
};

