import v from '../version.json';

/** From version.json, the one place the version is set (app.config.ts reads it too). */
export const APP_VERSION: string = v.version;
export const VERSION_CODE: number = v.versionCode;
