import { AffiliateNetworkAdapter, PostbackContext } from './AffiliateNetworkAdapter';
import { CanonicalEventType, NormalizedNetworkResult } from '../../types';
import { extractCleanTtclid } from '../../security/clickIdHelper';

export class BuyGoodsAdapter implements AffiliateNetworkAdapter {
  public network = 'buygoods' as const;

  public async verify(_context: PostbackContext): Promise<{ isValid: boolean; error?: string }> {
    return { isValid: true };
  }

  public async normalize(context: PostbackContext): Promise<NormalizedNetworkResult> {
    const params = { ...context.query, ...(typeof context.body === 'object' ? context.body : {}) };

    // Strict Transaction ID from official BuyGoods ORDERID / order_id macro (NO fake fallback)
    const rawTxId = params.order_id || params.orderid || params.ORDERID || params.transaction_id;
    if (!rawTxId || typeof rawTxId !== 'string' || rawTxId.trim() === '' || rawTxId.includes('{ORDERID}')) {
      return {
        isVerified: false,
        verificationError: 'Missing mandatory Order ID in BuyGoods postback payload',
        transactionId: '',
        eventType: 'unknown',
        currency: 'USD',
        commissionAmount: 0,
      };
    }
    const transactionId = rawTxId.trim();

    // Extract Click ID from subid, subid5, or subids
    const rawClickId =
      params.subid ||
      params.subid5 ||
      params.SUBID ||
      params.SUBID5 ||
      params.subid1 ||
      params.sub_id ||
      params.click_id ||
      undefined;

    const clickId = extractCleanTtclid(rawClickId);

    // Commission payout
    const commissionRaw = params.amount || params.commission || params.COMMISSION_AMOUNT || params.payout || '0';
    const commissionAmount = parseFloat(commissionRaw) || 0;

    // Gross basket amount
    const grossRaw = params.gross || params.gross_amount || params.total || undefined;
    const grossAmount = grossRaw ? parseFloat(grossRaw) : undefined;

    // Currency
    const currency = (params.currency || 'USD').toUpperCase();

    // Event type mapping
    const rawEvent = (params.event || params.status || params.action || 'purchase').toLowerCase();
    let eventType: CanonicalEventType = 'purchase';
    if (rawEvent.includes('upsell') || rawEvent.includes('up_sell')) {
      eventType = 'upsell';
    } else if (rawEvent.includes('refund')) {
      eventType = 'refund';
    } else if (rawEvent.includes('chargeback')) {
      eventType = 'chargeback';
    } else if (rawEvent.includes('recurring') || rawEvent.includes('rebill')) {
      eventType = 'rebill';
    }

    const productName = params.product || params.PRODUCT_CODENAME || params.product_codename || undefined;
    const campaignLabel = params.subid2 || params.SUBID2 || undefined;

    return {
      isVerified: true,
      transactionId,
      eventType,
      currency,
      commissionAmount,
      grossAmount,
      clickId,
      productName,
      campaignLabel,
      customerIp: params.ip || context.clientIp,
      customerUserAgent: params.user_agent || context.headers['user-agent'],
      rawDetails: params,
    };
  }

  public getSuccessResponse(_context: PostbackContext): { statusCode: number; body: string; contentType: string } {
    return {
      statusCode: 200,
      body: 'OK',
      contentType: 'text/plain',
    };
  }

  public buildDirectLink(baseUrl: string, clickIdMacro: string, metadata: Record<string, string> = {}): string {
    const url = new URL(baseUrl);
    url.searchParams.set('subid', clickIdMacro);
    if (metadata.campaign) url.searchParams.set('subid2', metadata.campaign);
    return url.toString();
  }

  public buildPostbackTemplate(workspaceId: string, secretToken: string, host: string): string {
    const cleanHost = host.replace(/\/$/, '');
    return `${cleanHost}/api/v1/postbacks/buygoods/${secretToken}?subid={SUBID}&subid5={SUBID5}&order_id={ORDERID}&amount={COMMISSION_AMOUNT}&product={PRODUCT_CODENAME}`;
  }
}
