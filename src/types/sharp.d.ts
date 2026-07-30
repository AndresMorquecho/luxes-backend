/**
 * Declaración minimal de sharp para compilación TypeScript.
 * La librería real (con tipos completos) se carga en runtime vía import() dinámico.
 * Si sharp está instalado (npm install), sus tipos propios tienen prioridad sobre este stub.
 */
declare module 'sharp' {
  interface Sharp {
    rotate(): Sharp;
    resize(options: { width?: number; withoutEnlargement?: boolean }): Sharp;
    webp(options?: { quality?: number }): Sharp;
    toFile(path: string): Promise<unknown>;
  }
  interface SharpConstructor {
    (input?: string | Buffer): Sharp;
  }
  const sharp: SharpConstructor;
  export = sharp;
}
