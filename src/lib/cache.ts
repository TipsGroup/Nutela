import retry from 'async-retry';
import ms from 'ms';

import checkPlatform from './platform';
import { Config, Asset } from './types';
import {
  MissingConfigurationPropertiesError,
  EmptyReleasesError,
  InvalidPlatformError,
  UnhandledError,
} from './errors';
import { SemVer } from 'semver';

const streamToString = async (stream: ReadableStream) => {
  const reader = stream.getReader();

  const chunks = [];

  let stop = false;

  while (!stop) {
    const { done, value } = await reader.read();

    if (value) {
      chunks.push(value);
    }

    if (done) {
      stop = true;
    }
  }

  return Buffer.concat(chunks).toString('utf-8');
};

export default class Cache {
  private readonly config: Config;
  private latest: {
    version?: SemVer;
    notes?: string;
    pub_date?: Date;
    platforms?: Record<string, Asset>;
    files?: Record<string, string>;
  };
  private lastUpdate: number | null;

  constructor(config: Config) {
    const { account, repository, token, url } = config;

    this.config = config;
    this.latest = {};
    this.lastUpdate = null;

    if (!account || !repository) {
      const error = new MissingConfigurationPropertiesError(
        'Neither ACCOUNT, nor REPOSITORY are defined',
      );
      throw error;
    }

    if (token && !url) {
      const error = new MissingConfigurationPropertiesError(
        'Neither VERCEL_URL, nor PRIVATE_BASE_URL is not defined, which are mandatory for private repo mode',
      );
      throw error;
    }

    this.cacheReleaseList = this.cacheReleaseList.bind(this);
    this.refreshCache = this.refreshCache.bind(this);
    this.loadCache = this.loadCache.bind(this);
    this.isOutdated = this.isOutdated.bind(this);
  }

  async cacheReleaseList(url: string, browserDownloadUrl: string) {
    const { token } = this.config;
    const shouldProxyPrivateDownload =
      token && typeof token === 'string' && token.length > 0;
    const headers: HeadersInit = { Accept: 'application/octet-stream' };

    if (token && typeof token === 'string' && token.length > 0) {
      headers.Authorization = `token ${token}`;
    }

    const { body } = await retry(
      async () => {
        const response = await fetch(url, { headers });

        if (response.status !== 200) {
          throw new Error(
            `Tried to cache RELEASES, but failed fetching ${url}, status ${response.status}`,
          );
        }

        return response;
      },
      { retries: 3 },
    );

    let content = await streamToString(body!);
    const matches = content.match(/[^ ]*\.nupkg/gim);

    if (!matches || matches.length === 0) {
      throw new EmptyReleasesError(
        `Tried to cache RELEASES, but failed. RELEASES content doesn't contain nupkg`,
      );
    }

    return content;
  }

  async refreshCache() {
    const { account, repository, pre, token } = this.config;
    const repo = account + '/' + repository;
    const url = `https://api.github.com/repos/${repo}/releases?per_page=100`;
    const headers: HeadersInit = { Accept: 'application/vnd.github.preview' };

    if (token && typeof token === 'string' && token.length > 0) {
      headers.Authorization = `token ${token}`;
    }

    const response = await retry(
      async () => {
        const response = await fetch(url, { headers });

        if (response.status !== 200) {
          throw new Error(
            `GitHub API responded with ${response.status} for url ${url}`,
          );
        }

        return response;
      },
      { retries: 3 },
    );

    const data = await response.json();

    if (!Array.isArray(data) || data.length === 0) {
      return;
    }

    const release = data.find(item => {
      const isPre = Boolean(pre) === Boolean(item.prerelease);
      return !item.draft && isPre;
    });

    if (!release?.assets || !Array.isArray(release.assets)) {
      return;
    }

    const { tag_name } = release;

    if (this.latest.version === tag_name) {
      console.log('Cached version is the same as latest');
      this.lastUpdate = Date.now();
      return;
    }

    console.log(`Caching version ${tag_name}...`);

    this.latest.version = tag_name;
    this.latest.notes = release.body;
    this.latest.pub_date = release.published_at;

    // Clear list of download links
    this.latest.platforms = {};

    for (const asset of release.assets) {
      const { name, browser_download_url, url, content_type, size } = asset;

      if (name === 'RELEASES') {
        try {
          if (!this.latest.files) {
            this.latest.files = {};
          }
          this.latest.files.RELEASES = await this.cacheReleaseList(
            url,
            browser_download_url,
          );
        } catch (err) {
          console.error(err);
        }
        continue;
      }

      try {
        const platform = checkPlatform(name);

        this.latest.platforms[platform] = {
          name,
          api_url: url,
          url: browser_download_url,
          content_type,
          size: Math.round((size / 1000000) * 10) / 10,
        };
      } catch (error) {
        if (error instanceof InvalidPlatformError) {
          continue;
        }

        throw new UnhandledError('Unhandled error!');
      }
    }

    console.log(`Finished caching version ${tag_name}`, this.latest);
    this.lastUpdate = Date.now();
  }

  isOutdated() {
    const { lastUpdate, config } = this;
    const { interval = 15 } = config;

    if (lastUpdate && Date.now() - lastUpdate > ms(`${interval}m`)) {
      return true;
    }

    return false;
  }

  // This is a method returning the cache
  // because the cache would otherwise be loaded
  // only once when the index file is parsed
  async loadCache() {
    const { latest, refreshCache, isOutdated, lastUpdate } = this;

    if (!lastUpdate || isOutdated()) {
      await refreshCache();
    }

    return Object.assign({}, latest);
  }
}
