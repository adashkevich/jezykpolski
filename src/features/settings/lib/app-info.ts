/**
 * App version display (`spec/tasks/24-settings-backup.md` §1's "О приложении" block, FR-135).
 *
 * DECISION LOG: `package.json`'s own `"version"` field is `"0.0.0"` — an unmanaged Vite
 * scaffold placeholder nothing in this codebase has ever bumped — and no other file reads or
 * displays it anywhere. Importing it directly (`import { version } from '../../../package.json'`)
 * would need `resolveJsonModule` added to `tsconfig.app.json` for a value that's currently
 * meaningless anyway. Given the task text's own mockup literally shows `0.1.0`, this constant
 * matches that literally, as a single, obvious place to update once the project adopts a real
 * versioning convention — not wired to `package.json` today.
 */
export const APP_VERSION = '0.1.0'
