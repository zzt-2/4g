import path from 'path';

const isPackaged = process.env.NODE_ENV !== 'development';

const rootPath = (isPackaged ? process.resourcesPath : path.resolve()).replace(
	/\//g,
	// process.platform === 'linux' ? '/' : '\\'
	'/'
);

export const pathAPI = {
	getDataPath: () => {
		// return path.join(rootPath, process.platform === 'linux' ? '/public/' : '\\public\\');
		return path.join(rootPath, 'public');
	},
	resolve: (...pathSegments: string[]) => path.resolve(...pathSegments),
	isPackaged: () => isPackaged,
};
