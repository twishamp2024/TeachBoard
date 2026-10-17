/**
 * electron-builder configuration. Identity comes from app.config.json.
 * Windows → NSIS installer; macOS → disk image. The builder names them
 * "<App>-Setup-<version>.exe/.dmg" (NSIS refuses to compile a file literally
 * named setup.exe because of Windows installer-detection shims); the release
 * step publishes them as release/windows/setup.exe and release/macos/setup.dmg.
 * See docs/PACKAGING.md.
 */
const app = require('./app.config.json')

// CI passes unset secrets as empty strings; electron-builder would treat an
// empty CSC_LINK as a certificate path. Treat empty values as not set.
for (const key of ['CSC_LINK', 'CSC_KEY_PASSWORD', 'CSC_NAME', 'APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID']) {
  if (process.env[key] === '') delete process.env[key]
}

const isMacBuild = process.argv.includes('--mac') || process.platform === 'darwin'
const hasMacIdentity = !!(process.env.CSC_LINK || process.env.CSC_NAME)
const canNotarize = !!(process.env.APPLE_ID && process.env.APPLE_APP_SPECIFIC_PASSWORD && process.env.APPLE_TEAM_ID)

module.exports = {
  appId: app.appId,
  productName: app.appName,
  copyright: app.copyright,
  directories: {
    output: isMacBuild ? 'dist/macos' : 'dist/windows',
    buildResources: 'build'
  },
  files: ['out/**/*', 'package.json'],
  asar: true,
  extraMetadata: {
    main: 'out/main/index.js',
    productName: app.appName,
    version: app.version,
    description: app.description
  },
  fileAssociations: [
    {
      ext: app.fileExtension,
      name: app.fileDescription,
      description: app.fileDescription,
      mimeType: app.fileMime,
      role: 'Editor'
    }
  ],
  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],
    icon: 'build/icon.png',
    artifactName: '${productName}-Setup-${version}.${ext}'
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowElevation: true,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    menuCategory: false,
    shortcutName: app.appName,
    uninstallDisplayName: app.appName,
    // User lessons live wherever the user saved them; app data (settings,
    // library) is kept on uninstall so a reinstall keeps preferences.
    deleteAppDataOnUninstall: false,
    // Generated from app.config.json by scripts/sync-app-config.mjs.
    include: 'build/installer.nsh',
    artifactName: '${productName}-Setup-${version}.${ext}'
  },
  mac: {
    target: [{ target: 'dmg', arch: ['universal'] }],
    icon: 'build/icon.png',
    category: 'public.app-category.education',
    artifactName: '${productName}-Setup-${version}.${ext}',
    // Without a Developer ID, sign ad hoc so the app runs on Apple silicon.
    identity: hasMacIdentity ? undefined : '-',
    hardenedRuntime: hasMacIdentity,
    gatekeeperAssess: false,
    entitlements: 'build/entitlements.mac.plist',
    entitlementsInherit: 'build/entitlements.mac.plist',
    notarize: hasMacIdentity && canNotarize
  },
  dmg: {
    artifactName: '${productName}-Setup-${version}.${ext}',
    title: `${app.appName} ${app.version}`,
    window: { width: 560, height: 380 },
    contents: [
      { x: 150, y: 190, type: 'file' },
      { x: 410, y: 190, type: 'link', path: '/Applications' }
    ]
  }
}
