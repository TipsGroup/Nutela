/* global describe, it, expect */
import Cache from '../src/lib/cache';

const assetsFetchMock = () =>
  Promise.resolve({
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve([
        {
          tag_name: 'v4.0.0-canary.5',
          draft: false,
          prerelease: false,
          assets: [],
        },
      ]),
  } as Response);

describe('Cache', () => {
  let fetchMock: any = undefined;

  beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch').mockImplementation(assetsFetchMock);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should throw when account is not defined', () => {
    expect(() => {
      const config = { repository: 'hyper' };
      new Cache(config);
    }).toThrow(/ACCOUNT/);
  });

  it('should throw when repository is not defined', () => {
    expect(() => {
      const config = { account: 'zeit' };
      new Cache(config);
    }).toThrow(/REPOSITORY/);
  });

  it('should throw when token is defined and url is not', () => {
    expect(() => {
      const config = { account: 'zeit', repository: 'hyper', token: 'abc' };
      new Cache(config);
    }).toThrow(/URL/);
  });

  it('should run without errors', () => {
    const config = {
      account: 'zeit',
      repository: 'hyper',
      token: process.env.TOKEN,
      url: process.env.PRIVATE_BASE_URL,
    };

    new Cache(config);
  });

  it('should refresh the cache', async () => {
    const config = {
      account: 'zeit',
      repository: 'hyper',
      token: process.env.TOKEN,
      url: process.env.PRIVATE_BASE_URL,
    };

    const cache = new Cache(config);
    const storage = await cache.loadCache();

    expect(typeof storage.version).toBe('string');
    expect(typeof storage.platforms).toBe('object');
  });

  it('should set platforms correctly', async () => {
    const config = {
      account: 'zeit',
      repository: 'hyper',
      token: process.env.TOKEN,
      url: process.env.PRIVATE_BASE_URL,
    };

    const cache = new Cache(config);
    const storage = await cache.loadCache();

    console.log(storage.platforms!.darwin);
  });
});
