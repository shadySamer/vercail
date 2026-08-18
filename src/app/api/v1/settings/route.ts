import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { db } from '@/lib/db/store';
import { postbackGenerator } from '@/lib/engine/PostbackGenerator';
import { encryptSecret } from '@/lib/security/crypto';
import { DEFAULT_WORKSPACE_ID } from '@/lib/db/seed';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const workspaceId = url.searchParams.get('workspaceId') || DEFAULT_WORKSPACE_ID;
  const origin = url.origin;

  const workspaces = db.getWorkspaces();
  const destinations = db.getDestinations(workspaceId);
  const integrations = db.getIntegrations(workspaceId);

  // Enrich integrations with direct linking instructions and postback URLs
  const enrichedIntegrations = integrations.map(i => {
    const postbackUrl = postbackGenerator.generate(i.network, workspaceId, i.secretToken, origin);

    let clickIdMacro = '&subid5=ttclid(__CLICKID__)';
    let exampleUrl = 'https://maxweb.com/aff/1234/5678?subid5=ttclid(__CLICKID__)';

    if (i.network === 'digistore24') {
      clickIdMacro = '&cid=ttclid(__CLICKID__)';
      exampleUrl = 'https://www.digistore24.com/redir/48190/AFFILIATE/CAMPAIGN?cid=ttclid(__CLICKID__)';
    } else if (i.network === 'buygoods') {
      clickIdMacro = '&subid=ttclid(__CLICKID__)';
      exampleUrl = 'https://www.buygoods.com/affiliate/redirect.html?aff_id=8831&prod_id=7102&subid=ttclid(__CLICKID__)';
    } else if (i.network === 'clickbank') {
      clickIdMacro = '&extclid=ttclid(__CLICKID__)';
      exampleUrl = 'https://hop.clickbank.net/?affiliate=AFFID&vendor=VENDORID&extclid=ttclid(__CLICKID__)&traffic_source=tiktok';
    }

    const assignedDestination = i.destinationId ? destinations.find(d => d.id === i.destinationId) : undefined;

    return {
      ...i,
      postbackUrl,
      clickIdMacro,
      exampleUrl,
      assignedDestination,
    };
  });

  return NextResponse.json({
    workspace: workspaces.find(w => w.id === workspaceId) || workspaces[0],
    destinations,
    integrations: enrichedIntegrations,
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = body.action;
    const workspaceId = body.workspaceId || DEFAULT_WORKSPACE_ID;

    // Action 1: Save / Update TikTok Destination
    if (action === 'save_destination' || action === 'save_pixel') {
      const pixelId = body.pixelId?.trim();
      const name = body.name?.trim() || `TikTok Pixel (${pixelId})`;
      const accessToken = body.accessToken?.trim();
      const defaultEventName = body.defaultEventName?.trim() || body.eventName?.trim() || 'CompletePayment';
      const testEventCode = body.testEventCode?.trim() || undefined;

      if (!pixelId) {
        return NextResponse.json({ error: 'Pixel ID is required' }, { status: 400 });
      }

      const existingDestinations = db.getDestinations(workspaceId);
      let targetDestination = existingDestinations.find(d => d.pixelId === pixelId || d.id === body.id);

      if (targetDestination) {
        targetDestination.name = name;
        targetDestination.pixelId = pixelId;
        targetDestination.defaultEventName = defaultEventName;
        targetDestination.testEventCode = testEventCode;
        if (accessToken) {
          targetDestination.accessTokenEncrypted = encryptSecret(accessToken);
        }
        db.saveDestination(targetDestination);
      } else {
        targetDestination = {
          id: uuidv4(),
          workspaceId,
          name,
          pixelId,
          accessTokenEncrypted: accessToken ? encryptSecret(accessToken) : encryptSecret('dummy_token'),
          defaultEventName,
          testEventCode,
          status: 'active',
          createdAt: new Date().toISOString(),
        };
        db.saveDestination(targetDestination);
      }

      return NextResponse.json({ success: true, destination: targetDestination });
    }

    // Action 2: Update Affiliate Integration Routing & Value Strategy
    if (action === 'save_integration' || action === 'update_network') {
      const integrationId = body.integrationId || body.networkAccountId;
      const destinationId = body.destinationId !== undefined ? body.destinationId : body.targetPixelId;
      const eventName = body.eventName || body.targetEventName;
      const valueStrategy = body.valueStrategy || 'commission';
      const webhookSecret = body.webhookSecret;

      const integrations = db.getIntegrations(workspaceId);
      const integration = integrations.find(i => i.id === integrationId);
      if (!integration) {
        return NextResponse.json({ error: 'Integration channel not found' }, { status: 404 });
      }

      if (destinationId !== undefined) integration.destinationId = destinationId || undefined;
      if (eventName !== undefined) integration.eventName = eventName || undefined;
      if (valueStrategy !== undefined) integration.valueStrategy = valueStrategy;
      if (webhookSecret !== undefined) {
        integration.webhookSecretEncrypted = webhookSecret ? encryptSecret(webhookSecret) : undefined;
      }

      db.saveIntegration(integration);
      return NextResponse.json({ success: true, integration });
    }

    // Action 3: Delete TikTok Destination
    if (action === 'delete_destination') {
      const destinationId = body.id || body.destinationId;
      if (!destinationId) {
        return NextResponse.json({ error: 'Destination ID is required' }, { status: 400 });
      }
      const deleted = db.deleteDestination(destinationId, workspaceId);
      return NextResponse.json({ success: deleted });
    }

    // Action 4: Delete Affiliate Integration
    if (action === 'delete_integration') {
      const integrationId = body.id || body.integrationId;
      if (!integrationId) {
        return NextResponse.json({ error: 'Integration ID is required' }, { status: 400 });
      }
      const deleted = db.deleteIntegration(integrationId, workspaceId);
      return NextResponse.json({ success: deleted });
    }

    // Action 5: Add New Custom Integration Channel
    if (action === 'add_integration') {
      const network = body.network;
      const name = body.name?.trim() || `${network.toUpperCase()} S2S Channel`;
      const secretToken = body.secretToken?.trim() || `${network.substring(0, 2)}_live_sec_${Math.floor(100000 + Math.random() * 900000)}`;
      const destinationId = body.destinationId || undefined;
      const eventName = body.eventName || 'CompletePayment';
      const valueStrategy = body.valueStrategy || 'commission';

      const newIntegration = {
        id: `int-${network}-${Date.now().toString(36)}`,
        workspaceId,
        network,
        name,
        secretToken,
        destinationId,
        eventName,
        valueStrategy,
        status: 'connected' as const,
        createdAt: new Date().toISOString(),
      };

      db.saveIntegration(newIntegration);
      return NextResponse.json({ success: true, integration: newIntegration });
    }

    // Action 6: Regenerate Secret Token
    if (action === 'regenerate_token') {
      const integrationId = body.integrationId;
      const integration = db.getIntegrationById(integrationId, workspaceId);
      if (!integration) {
        return NextResponse.json({ error: 'Integration channel not found' }, { status: 404 });
      }
      const newToken = `${integration.network.substring(0, 2)}_live_sec_${Math.floor(100000 + Math.random() * 900000)}`;
      integration.secretToken = newToken;
      db.saveIntegration(integration);
      return NextResponse.json({ success: true, secretToken: newToken });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
