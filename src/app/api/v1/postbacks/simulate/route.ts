import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/store';
import { NetworkType, CanonicalEventType } from '@/lib/types';
import { DEFAULT_WORKSPACE_ID } from '@/lib/db/seed';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const network = (body.network || 'maxweb') as NetworkType;
    const workspaceId = body.workspaceId || DEFAULT_WORKSPACE_ID;
    const clickId = body.clickId || `ttclid(E.C.P.demo_${Date.now().toString(36)})`;
    const orderId = body.orderId || `${network.substring(0, 2).toUpperCase()}-${Math.floor(Math.random() * 899999 + 100000)}`;
    const amount = Number(body.amount || 135.0);
    const eventType = (body.eventType || 'purchase') as CanonicalEventType;

    const networkAccounts = db.getNetworkAccounts(workspaceId);
    const networkAccount = networkAccounts.find(n => n.network === network) || networkAccounts[0];

    if (!networkAccount) {
      return NextResponse.json({ error: `No network integration configured for ${network}` }, { status: 404 });
    }

    let endpointUrl = `/api/v1/postbacks/${network}/${workspaceId}/${networkAccount.secretToken}`;
    let requestMethod = 'GET';
    let queryParams: Record<string, string> = {};
    let postBody: any = undefined;

    if (network === 'maxweb') {
      queryParams = {
        subid5: clickId,
        subid2: body.campaign || 'TT-US-NUTR-01',
        order_id: orderId,
        amount: amount.toString(),
        product: body.productName || 'ProDentim Dental Health',
        currency: 'USD',
        event: eventType === 'refund' ? 'refund' : eventType === 'upsell' ? 'upsell' : 'sale',
      };
    } else if (network === 'buygoods') {
      queryParams = {
        subid: clickId,
        subid2: body.campaign || 'TT-US-VSL-SCALE',
        order_id: orderId,
        amount: amount.toString(),
        product: body.productName || 'NeuroDr Brain Clarity',
      };
    } else if (network === 'digistore24') {
      queryParams = {
        cid: clickId,
        transaction_id: orderId,
        order_type: eventType === 'upsell' ? 'upsell' : 'initial_sale',
        amount_affiliate: amount.toString(),
        amount_brutto: (amount * 1.4).toString(),
        currency: 'USD',
        transaction_type: eventType === 'refund' ? 'refund' : eventType === 'chargeback' ? 'chargeback' : 'payment',
        product_id: '48190',
        product_name: body.productName || 'Quantum Manifestation Code',
      };
    } else if (network === 'clickbank') {
      queryParams = {
        extclid: clickId,
        receipt: orderId,
        amount: amount.toString(),
        transactionType: eventType === 'refund' ? 'RFND' : eventType === 'rebill' ? 'BILL' : 'SALE',
        currency: 'USD',
      };
    }

    const origin = new URL(request.url).origin;
    const fullUrl = new URL(endpointUrl, origin);
    Object.entries(queryParams).forEach(([k, v]) => fullUrl.searchParams.set(k, v));

    const response = await fetch(fullUrl.toString(), {
      method: requestMethod,
      headers: {
        'Content-Type': 'application/json',
        'x-simulated-postback': 'true',
      },
      body: postBody ? JSON.stringify(postBody) : undefined,
    });

    const responseText = await response.text();

    return NextResponse.json({
      success: response.ok,
      httpStatus: response.status,
      networkResponse: responseText,
      simulatedDetails: {
        network,
        orderId,
        clickId,
        amount,
        eventType,
        url: fullUrl.toString(),
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
