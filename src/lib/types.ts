export type Config = {
  interval?: string;
  account?: string;
  repository?: string;
  pre?: string;
  token?: string;
  url?: string;
};

export type Asset = {
  name: string;
  api_url: string;
  url: string;
  content_type: string;
  size: number;
};
