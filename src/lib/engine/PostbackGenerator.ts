import { networkRegistry } from '../adapters/network/NetworkRegistry';
import { NetworkType } from '../types';

export class PostbackGenerator {
  /**
   * Generates the ready-to-copy Postback URL for an affiliate network
   */
  public generate(
    network: NetworkType,
    workspaceId: string,
    secretToken: string,
    host: string = 'https://engine.ourdomain.com'
  ): string {
    const adapter = networkRegistry.getAdapter(network);
    if (!adapter) return '';
    return adapter.buildPostbackTemplate(workspaceId, secretToken, host);
  }
}

export const postbackGenerator = new PostbackGenerator();
