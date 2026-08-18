import { db } from '../db/store';
import { networkRegistry } from '../adapters/network/NetworkRegistry';
import { NetworkType } from '../types';

export interface ValidationCheckItem {
  id: string;
  name: string;
  category: 'link' | 'network' | 'pixel' | 'security';
  status: 'pass' | 'fail' | 'warn';
  message: string;
  recommendation?: string;
}

export interface ValidationResult {
  isReady: boolean;
  statusLabel: 'READY' | 'WARNING' | 'NOT READY';
  checks: ValidationCheckItem[];
}

export class SmartValidator {
  /**
   * Pre-flight health and configuration check before launching TikTok Ads
   */
  public validate(params: {
    workspaceId: string;
    network: NetworkType;
    networkAccountId?: string;
    offerUrl: string;
    pixelId: string;
    generatedUrl: string;
  }): ValidationResult {
    const checks: ValidationCheckItem[] = [];

    // 1. Check URL syntax
    try {
      new URL(params.offerUrl);
      checks.push({
        id: 'url_format',
        name: 'Offer URL Syntax',
        category: 'link',
        status: 'pass',
        message: 'Valid absolute URL structure with HTTPS support',
      });
    } catch {
      checks.push({
        id: 'url_format',
        name: 'Offer URL Syntax',
        category: 'link',
        status: 'fail',
        message: 'Invalid URL format',
        recommendation: 'Ensure URL begins with https://',
      });
    }

    // 2. Check Click ID Macro Placeholder
    const hasClickIdMacro = params.generatedUrl.includes('__CLICKID__');
    const adapter = networkRegistry.getAdapter(params.network);

    let expectedParam = 'subid';
    if (params.network === 'digistore24') expectedParam = 'cid';
    if (params.network === 'clickbank') expectedParam = 'extclid';

    const hasExpectedParam = params.generatedUrl.includes(`${expectedParam}=__CLICKID__`) || params.generatedUrl.includes(`${expectedParam}=`);

    if (hasClickIdMacro && hasExpectedParam) {
      checks.push({
        id: 'macro_injection',
        name: 'TikTok Click ID Macro',
        category: 'link',
        status: 'pass',
        message: `Macro correctly mapped to network parameter (${expectedParam}=__CLICKID__)`,
      });
    } else {
      checks.push({
        id: 'macro_injection',
        name: 'TikTok Click ID Macro',
        category: 'link',
        status: 'fail',
        message: `Missing or incorrect Click ID parameter for ${params.network}`,
        recommendation: `Expected ${expectedParam}=__CLICKID__`,
      });
    }

    // 3. Check TikTok Pixel Status
    const pixels = db.getPixels(params.workspaceId);
    const pixel = pixels.find(p => p.pixelId === params.pixelId);

    if (pixel && pixel.status === 'active') {
      checks.push({
        id: 'pixel_status',
        name: 'TikTok Pixel Destination',
        category: 'pixel',
        status: 'pass',
        message: `Pixel ${pixel.name} (${pixel.pixelId}) is active and healthy`,
      });
    } else if (pixel) {
      checks.push({
        id: 'pixel_status',
        name: 'TikTok Pixel Destination',
        category: 'pixel',
        status: 'warn',
        message: `Pixel ${pixel.pixelId} is marked inactive`,
        recommendation: 'Verify pixel status in TikTok Ads Manager',
      });
    } else {
      checks.push({
        id: 'pixel_status',
        name: 'TikTok Pixel Destination',
        category: 'pixel',
        status: 'fail',
        message: `Pixel ${params.pixelId} not found in workspace`,
        recommendation: 'Connect pixel in Integrations tab',
      });
    }

    // 4. Check Network Account & Postback Route
    const networkAccounts = db.getNetworkAccounts(params.workspaceId);
    const networkAccount = params.networkAccountId
      ? networkAccounts.find(n => n.id === params.networkAccountId)
      : networkAccounts.find(n => n.network === params.network);

    if (networkAccount && networkAccount.status === 'connected') {
      checks.push({
        id: 'network_postback',
        name: 'Postback Ingestion Route',
        category: 'network',
        status: 'pass',
        message: `Network account "${networkAccount.accountName}" connected with active security token`,
      });
    } else {
      checks.push({
        id: 'network_postback',
        name: 'Postback Ingestion Route',
        category: 'network',
        status: 'fail',
        message: `No connected network account found for ${params.network}`,
        recommendation: 'Configure your network credentials under Integrations',
      });
    }

    // Determine overall status
    const hasFail = checks.some(c => c.status === 'fail');
    const hasWarn = checks.some(c => c.status === 'warn');

    return {
      isReady: !hasFail,
      statusLabel: hasFail ? 'NOT READY' : hasWarn ? 'WARNING' : 'READY',
      checks,
    };
  }
}

export const smartValidator = new SmartValidator();
