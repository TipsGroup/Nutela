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
