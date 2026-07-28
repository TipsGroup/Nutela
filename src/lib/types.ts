/**
 * Bucket S3/R2 onde as releases são espelhadas, para servir o instalador com um
 * nome de arquivo próprio. Opcional: sem isso o espelho fica desligado e as
 * rotas seguem redirecionando para o GitHub como sempre.
 */
export type StorageConfig = {
  bucket?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  region?: string;
  endpoint?: string;
  prefix?: string;
};

export type Config = {
  interval?: string;
  account?: string;
  repository?: string;
  pre?: string;
  token?: string;
  url?: string;
  storage?: StorageConfig;
};

export type Asset = {
  name: string;
  api_url: string;
  url: string;
  content_type: string;
  size: number;
};
