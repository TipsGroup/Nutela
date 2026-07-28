import nutela from './index';

const {
  INTERVAL: interval,
  ACCOUNT: account,
  REPOSITORY: repository,
  PRE: pre,
  TOKEN: token,
  PRIVATE_BASE_URL,
  VERCEL_URL,
} = process.env;

const url = VERCEL_URL ?? PRIVATE_BASE_URL;

// Sem estas variáveis o espelho fica desligado e as rotas de download seguem
// redirecionando para o GitHub como sempre.
const storage = {
  bucket: process.env.BUCKET_NAME_CLOUDFLARE_R2,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID_CLOUDFLARE_R2,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY_CLOUDFLARE_R2,
  region: process.env.AWS_DEFAULT_REGION_CLOUDFLARE_R2,
  endpoint: process.env.AWS_ENDPOINT_CLOUDFLARE_R2,
  prefix: process.env.RELEASES_MIRROR_PREFIX,
};

export default nutela({
  interval,
  account,
  repository,
  pre,
  token,
  url,
  storage,
});
