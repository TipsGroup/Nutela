// Native
import { extname } from 'path';
import { InvalidPlatformError } from './errors';

export default (fileName: string) => {
  const extension = extname(fileName).slice(1);
  const arch =
    fileName.includes('arm64') || fileName.includes('aarch64') ? '_arm64' : '';

  if (
    (fileName.includes('mac') || fileName.includes('darwin')) &&
    extension === 'zip'
  ) {
    return 'darwin' + arch;
  }

  const directCache = ['exe', 'dmg', 'rpm', 'deb', 'AppImage'];

  if (!directCache.includes(extension)) {
    throw new InvalidPlatformError('Invalid platform');
  }

  return extension + arch;
};
