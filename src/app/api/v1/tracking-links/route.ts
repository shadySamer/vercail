import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { db } from '@/lib/db/store';
import { directLinkGenerator } from '@/lib/engine/DirectLinkGenerator';
import { smartValidator } from '@/lib/engine/SmartValidator';
import { DEFAULT_WORKSPACE_ID } from '@/lib/db/seed';
import { NetworkType } from '@/lib/types';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const workspaceId = url.searchParams.get('workspaceId') || DEFAULT_WORKSPACE_ID;
  const links = db.getTrackingLinks(workspaceId);
  const offers = db.getOffers(workspaceId);
  const pixels = db.getPixels(workspaceId);

  const enriched = links.map(l => {
    const offer = offers.find(o => o.id === l.offerId);
    const pixel = pixels.find(p => p.pixelId === l.pixelId);
    return {
      ...l,
      offerName: offer?.name || 'Unknown Offer',
      network: offer?.network || 'maxweb',
      pixelName: pixel?.name || l.pixelId,
    };
  });

  return NextResponse.json({ links: enriched });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const workspaceId = body.workspaceId || DEFAULT_WORKSPACE_ID;
    const offerId = body.offerId;
    const pixelId = body.pixelId;
    const campaignLabel = body.campaignLabel || 'TT-CAMPAIGN';
    const adgroupLabel = body.adgroupLabel;
    const adLabel = body.adLabel;
    const creativeLabel = body.creativeLabel;

    const offer = db.getOfferById(offerId);
    if (!offer) {
      return NextResponse.json({ error: 'Offer not found' }, { status: 404 });
    }

    const network = offer.network as NetworkType;
    const generatedUrl = directLinkGenerator.generate(network, offer.targetUrl, {
      campaign: campaignLabel,
      adgroup: adgroupLabel,
      ad: adLabel,
      creative: creativeLabel,
    });

    let clickIdParam = 'subid';
    if (network === 'digistore24') clickIdParam = 'cid';
    if (network === 'clickbank') clickIdParam = 'extclid';

    const newLink = {
      id: uuidv4(),
      workspaceId,
      offerId,
      pixelId,
      campaignLabel,
      adgroupLabel,
      adLabel,
      creativeLabel,
      clickIdParameter: clickIdParam,
      generatedDestinationUrl: generatedUrl,
      createdAt: new Date().toISOString(),
    };

    db.saveTrackingLink(newLink);

    // Run Pre-flight Validation
    const validation = smartValidator.validate({
      workspaceId,
      network,
      networkAccountId: offer.networkAccountId,
      offerUrl: offer.targetUrl,
      pixelId,
      generatedUrl,
    });

    return NextResponse.json({
      link: newLink,
      validation,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
