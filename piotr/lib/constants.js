import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const ROOT_DIR = path.resolve(__dirname, '..');
export const DEMO_PACKAGES_DIR = path.join(ROOT_DIR, 'demo-packages');
export const ARTIFACTS_DIR = path.join(ROOT_DIR, 'artifacts');
export const TARBALLS_DIR = path.join(ARTIFACTS_DIR, 'tarballs');
export const REPORTS_DIR = path.join(ARTIFACTS_DIR, 'reports');
export const MANIFEST_PATH = path.join(ARTIFACTS_DIR, 'demo-manifest.json');
export const DEFAULT_GATEWAY_HOST = 'gateway.pinata.cloud';
export const TEXT_RECORD_PREFIX = 'npmguard';
export const DEFAULT_ROOT_DOMAIN = process.env.NPMGUARD_BASE_DOMAIN ?? 'npmguard.eth';
export const DEFAULT_ENS_DEPLOYMENTS = {
  sepolia: {
    chainId: 11155111,
    registry: '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e',
    nameWrapper: '0x0635513f179D50A207757E05759CbD106d7dFcE8',
    publicResolver: '0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5'
  }
};
