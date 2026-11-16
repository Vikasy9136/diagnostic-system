const { getDefaultConfig } = require('expo/metro-config');
const fs = require('fs');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');
const sharedRoot = path.resolve(monorepoRoot, 'packages', 'shared');
const rootNodeModules = path.resolve(monorepoRoot, 'node_modules');

const canonicalPath = (targetPath) => {
  try {
    return fs.realpathSync.native(targetPath);
  } catch {
    return targetPath;
  }
};

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const monorepoRoots = Array.from(new Set([monorepoRoot, canonicalPath(monorepoRoot)]));

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(projectRoot);

// Watch @diagnostic/shared and hoisted node_modules (including canonical Windows drive casing)
// so Metro resolves workspace junctions cleanly without scanning heavy web/api/firebase folders.
config.watchFolders = Array.from(
  new Set([
    projectRoot,
    canonicalPath(projectRoot),
    sharedRoot,
    canonicalPath(sharedRoot),
    rootNodeModules,
    canonicalPath(rootNodeModules),
  ])
);

config.resolver = config.resolver || {};
config.resolver.nodeModulesPaths = Array.from(
  new Set([
    path.resolve(projectRoot, 'node_modules'),
    path.resolve(canonicalPath(projectRoot), 'node_modules'),
    rootNodeModules,
    canonicalPath(rootNodeModules),
  ])
);

const existingBlockList = config.resolver.blockList
  ? Array.isArray(config.resolver.blockList)
    ? config.resolver.blockList
    : [config.resolver.blockList]
  : [];

config.resolver.blockList = [
  ...existingBlockList,
  ...monorepoRoots.flatMap((root) => [
    new RegExp(`^${escapeRegex(path.resolve(root, 'apps', 'web'))}[\\\\/].*`),
    new RegExp(`^${escapeRegex(path.resolve(root, 'apps', 'api'))}[\\\\/].*`),
    new RegExp(`^${escapeRegex(path.resolve(root, 'firebase'))}[\\\\/].*`),
  ]),
];

// Support Firebase CJS/MJS entrypoints cleanly alongside TypeScript/JSX modules
config.resolver.sourceExts = Array.from(
  new Set([...(config.resolver.sourceExts || []), 'cjs', 'mjs'])
);

// Pin react & react-dom to phlebo-app's installed copy so hoisted react@18.3.1 (used by Vite web apps) never creates dual React instances.
// Also bypass package.json "exports" for firebase/@firebase/* so RN CJS (@firebase/auth/dist/rn) and ESM entrypoints share one @firebase/app registry.
const pinnedOrigin = path.join(canonicalPath(projectRoot), 'package.json');
const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@diagnostic/shared') {
    const sharedDist = path.join(sharedRoot, 'dist', 'index.js');
    const sharedSrc = path.join(sharedRoot, 'src', 'index.ts');
    if (fs.existsSync(sharedDist)) {
      return { type: 'sourceFile', filePath: sharedDist };
    }
    if (fs.existsSync(sharedSrc)) {
      return { type: 'sourceFile', filePath: sharedSrc };
    }
  }

  const isReactFamily =
    moduleName === 'react' ||
    moduleName.startsWith('react/') ||
    moduleName === 'react-dom' ||
    moduleName.startsWith('react-dom/');

  const isFirebaseFamily =
    moduleName === 'firebase' ||
    moduleName.startsWith('firebase/') ||
    moduleName.startsWith('@firebase/');

  let effectiveContext = context;
  if (isReactFamily && !context.originModulePath.startsWith(projectRoot)) {
    effectiveContext = { ...effectiveContext, originModulePath: pinnedOrigin };
  }
  if (isFirebaseFamily) {
    effectiveContext = { ...effectiveContext, unstable_enablePackageExports: false };
  }

  const resolver = originalResolveRequest || effectiveContext.resolveRequest;
  return resolver(effectiveContext, moduleName, platform);
};

module.exports = config;
