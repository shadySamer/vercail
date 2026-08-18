import { networkRegistry } from '../adapters/network/NetworkRegistry';
import { NetworkType } from '../types';

export class DirectLinkGenerator {
  /**
   * Generates the final TikTok Destination URL tailored per network
   */
  public generate(
    network: NetworkType,
    baseUrl: string,
    metadata: {
      campaign?: string;
      adgroup?: string;
      ad?: string;
      creative?: string;
      custom1?: string;
    } = {}
  ): string {
    const adapter = networkRegistry.getAdapter(network);
    if (!adapter) return baseUrl;

    return adapter.buildDirectLink(baseUrl, '__CLICKID__', metadata);
  }
}

export const directLinkGenerator = new DirectLinkGenerator();
