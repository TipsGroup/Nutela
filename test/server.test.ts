/* global describe, it, afterEach */
import { serve } from 'micro';
import http from 'http';

import listen from 'test-listen';

const initialEnv = Object.assign({}, process.env);

afterEach(() => {
  process.env = initialEnv;
});

describe('Server', () => {
  it('Should start without errors', async () => {
    process.env = {
      ACCOUNT: 'zeit',
      REPOSITORY: 'hyper',
    };

    const run = require('../src/lib/server');

    const server = new http.Server(serve(run));

    await listen(server);

    server.close();
  });
});

describe('Path normalization', () => {
  it('Should route URLs with repeated slashes like the clean path', async () => {
    const nutela = require('../src/lib/index').default;

    const handler = nutela({ account: 'zeit', repository: 'hyper' });
    const server = new http.Server(handler);
    const base = await listen(server);

    try {
      const clean = await fetch(`${base}/update/darwin/not-semver`);
      const doubled = await fetch(`${base}//update//darwin/not-semver`);

      expect(clean.status).toBe(500);
      expect(doubled.status).toBe(clean.status);
    } finally {
      server.close();
    }
  });
});
