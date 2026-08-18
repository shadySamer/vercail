import { NetworkType, NormalizedNetworkResult, NetworkAccount } from '../../types';

export interface PostbackContext {
  network: NetworkType;
  workspaceId: string;
  networkAccount: NetworkAccount;
  headers: Record<string, string>;
  query: Record<string, string>;
  body: any;
  clientIp: string;
}

export interface AffiliateNetworkAdapter {
  network: NetworkType;

  /**
   * Verify signature, passphrase, or security token of the incoming request
   */
  verify(context: PostbackContext): Promise<{ isValid: boolean; error?: string }>;

  /**
   * Normalize the raw postback / IPN payload into standardized conversion fields
   */
  normalize(context: PostbackContext): Promise<NormalizedNetworkResult>;

  /**
   * Produce the exact response required by the network (e.g. "OK" echo)
   */
  getSuccessResponse(context: PostbackContext): { statusCode: number; body: string; contentType: string };

  /**
   * Generate canonical destination URL with proper TikTok Click ID macros
   */
  buildDirectLink(baseUrl: string, clickIdMacro: string, metadata?: Record<string, string>): string;

  /**
   * Generate default postback URL template with network macro tokens
   */
  buildPostbackTemplate(workspaceId: string, secretToken: string, host: string): string;
}
