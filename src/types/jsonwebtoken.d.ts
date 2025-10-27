declare module "jsonwebtoken" {
  export interface SignOptions {
    expiresIn?: string | number;
    algorithm?: string;
    audience?: string | string[];
    issuer?: string;
    subject?: string;
  }

  export function sign(
    payload: string | Buffer | Record<string, unknown>,
    secretOrPrivateKey: string,
    options?: SignOptions
  ): string;
}
