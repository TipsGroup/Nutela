import hazel from './index';

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

export default hazel({
  interval,
  account,
  repository,
  pre,
  token,
  url,
});
