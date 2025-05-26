import path from 'path';

const isPackaged = process.env.NODE_ENV !== 'development';

const rootPath = path.resolve();

export const pathAPI = {
  getDataPath: () => {
    return isPackaged ? rootPath + `/resources/app/` : rootPath + `/public/`;
  },
  resolve: (...pathSegments: string[]) => path.resolve(...pathSegments),
  isPackaged: () => isPackaged,
};
