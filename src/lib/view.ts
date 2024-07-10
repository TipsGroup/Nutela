// Native
import path from 'path';

import fs from 'fs';
import { promisify } from 'util';

// Packages
import { compile } from 'handlebars';

export default async () => {
  const viewPath = path.normalize(path.join(__dirname, '/../views/index.hbs'));
  const viewContent = await promisify(fs.readFile)(viewPath, 'utf8');

  return compile(viewContent);
};
