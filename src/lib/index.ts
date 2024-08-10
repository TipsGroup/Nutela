// Packages
import Router from 'router';
import { type IncomingMessage, type ServerResponse } from 'node:http';
import finalhandler from 'finalhandler';

import Cache from './cache';
import Routes from './routes';
import { Config } from './types';
import { MissingConfigurationPropertiesError, UnhandledError } from './errors';

export default (config: Config) => {
  const router = Router();

  try {
    const cache = new Cache(config);

    const routes = Routes({ cache, config });

    router.get('/', routes.overview);
    router.get('/download', routes.download);
    router.get('/download/:platform', routes.downloadPlatform);
    router.get('/update/:platform/:version', routes.update);
    router.get('/update/win32/:version/:filename', routes.releases);

    return (req: IncomingMessage, res: ServerResponse) => {
      router(req, res, finalhandler(req, res));
    };
  } catch (err) {
    if (err instanceof MissingConfigurationPropertiesError) {
      const { message } = err as Error;

      return (req: IncomingMessage, res: ServerResponse) => {
        res.statusCode = 400;

        res.end(
          JSON.stringify({
            error: {
              message,
            },
          }),
        );
      };
    }

    throw new UnhandledError('Unhandled error!');
  }
};
