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
        currency: null,
        amountCommission: null,
        amountGross: null,
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

    const clickIdClean = extractCleanTtclid(rawClickId);

    // Commission payout from COMMISSION_AMOUNT (Nullable if absent)
    const commissionRaw = params.amount || params.commission || params.COMMISSION_AMOUNT || params.payout;
    const amountCommission = commissionRaw ? parseFloat(commissionRaw) : null;

    // Gross basket amount if provided
    const grossRaw = params.gross || params.gross_amount || params.total;
    const amountGross = grossRaw ? parseFloat(grossRaw) : null;

    // Currency (Nullable if absent)
    const currency = params.currency ? params.currency.toUpperCase() : null;

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

    return {
      isVerified: true,
      transactionId,
      eventType,
      currency,
      amountCommission,
      amountGross,
      clickIdRaw: rawClickId,
      clickIdClean,
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
    if (metadata.adgroup) url.searchParams.set('subid3', metadata.adgroup);
    if (metadata.ad) url.searchParams.set('subid4', metadata.ad);
    return url.toString();
  }

  public buildPostbackTemplate(workspaceId: string, secretToken: string, host: string): string {
    return `https://${host}/api/v1/postbacks/maxweb/${workspaceId}/${secretToken}?orderid={ORDERID}&subid5={SUBID}&amount={COMMISSION_AMOUNT}&currency={CURRENCY}`;
  }
}
