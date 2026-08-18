import { AffiliateNetworkAdapter, PostbackContext } from './AffiliateNetworkAdapter';
import { CanonicalEventType, NormalizedNetworkResult } from '../../types';
import { extractCleanTtclid } from '../../security/clickIdHelper';

export class MaxWebAdapter implements AffiliateNetworkAdapter {
  public network = 'maxweb' as const;

  public async verify(_context: PostbackContext): Promise<{ isValid: boolean; error?: string }> {
    return { isValid: true };
  }

  public async normalize(context: PostbackContext): Promise<NormalizedNetworkResult> {
    const params = { ...context.query, ...(typeof context.body === 'object' ? context.body : {}) };

    // Strict Transaction ID from official MaxWeb ORDERID / order_id macro (NO fake fallback)
    const rawTxId = params.order_id || params.orderid || params.ORDERID || params.transaction_id;
    if (!rawTxId || typeof rawTxId !== 'string' || rawTxId.trim() === '' || rawTxId.includes('{ORDERID}')) {
      return {
        isVerified: false,
        verificationError: 'Missing mandatory Order ID in MaxWeb postback payload',
        transactionId: '',
        eventType: 'unknown',
        currency: 'USD',
        commissionAmount: 0,
      };
    }
    const transactionId = rawTxId.trim();

    // Extract Click ID from subid5, subid, or other subids
    const rawClickId =
      params.subid5 ||
      params.subid ||
      params.subid1 ||
      params.subid2 ||
      params.subid3 ||
      params.subid4 ||
      params.SUBID5 ||
      params.SUBID ||
      params.click_id ||
      undefined;

    const clickId = extractCleanTtclid(rawClickId);

    // Commission payout from COMMISSION_AMOUNT
    const commissionRaw = params.amount || params.commission || params.COMMISSION_AMOUNT || params.payout || '0';
    const commissionAmount = parseFloat(commissionRaw) || 0;

    // Gross basket amount if provided
    const grossRaw = params.gross || params.gross_amount || params.total || undefined;
    const grossAmount = grossRaw ? parseFloat(grossRaw) : undefined;

    // Currency
    const currency = (params.currency || 'USD').toUpperCase();

    // Event type mapping
    const rawEvent = (params.event || params.status || 'sale').toLowerCase();
    let eventType: CanonicalEventType = 'purchase';
    if (rawEvent.includes('upsell') || rawEvent.includes('up_sell')) {
      eventType = 'upsell';
    } else if (rawEvent.includes('refund') || rawEvent.includes('return')) {
      eventType = 'refund';
    } else if (rawEvent.includes('checkout') || rawEvent.includes('visit')) {
      eventType = 'checkout_started';
    } else if (rawEvent.includes('chargeback')) {
      eventType = 'chargeback';
    } else if (rawEvent.includes('rebill') || rawEvent.includes('recurring')) {
      eventType = 'rebill';
    }

    const productName = params.product || params.PRODUCT_CODENAME || params.product_name || undefined;
    const campaignLabel = params.subid2 || params.SUBID2 || undefined;
    const adgroupLabel = params.subid3 || params.SUBID3 || undefined;
    const adLabel = params.subid4 || params.SUBID4 || undefined;

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
      adgroupLabel,
      adLabel,
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
    url.searchParams.set('subid5', clickIdMacro);
    if (metadata.campaign) url.searchParams.set('subid2', metadata.campaign);
    return url.toString();
  }

  public buildPostbackTemplate(workspaceId: string, secretToken: string, host: string): string {
    const cleanHost = host.replace(/\/$/, '');
    return `${cleanHost}/api/v1/postbacks/maxweb/${secretToken}?subid5={SUBID5}&subid={SUBID}&order_id={ORDERID}&amount={COMMISSION_AMOUNT}&product={PRODUCT_CODENAME}&currency=USD&event=sale`;
  }
}
