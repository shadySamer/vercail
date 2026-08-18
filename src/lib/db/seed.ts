import { v4 as uuidv4 } from 'uuid';
import { db } from './store';
import { Workspace, AffiliateIntegration, IntegrationHealth } from '../types';

export const DEFAULT_WORKSPACE_ID = 'ws-master-01';

export function seedInitialData() {
  const existingWorkspaces = db.getWorkspaces();
  if (existingWorkspaces.length > 0) {
    return;
  }

  // 1. Production Master Workspace
  const masterWorkspace: Workspace = {
    id: DEFAULT_WORKSPACE_ID,
    name: 'Production Workspace',
    slug: 'production',
    createdAt: new Date().toISOString(),
  };
  db.saveWorkspace(masterWorkspace);

  // 2. Initialize 4 Official Affiliate Network Integrations
  const networks: Array<{ network: 'maxweb' | 'buygoods' | 'digistore24' | 'clickbank'; name: string; token: string }> = [
    { network: 'maxweb', name: 'MaxWeb S2S Channel', token: 'mw_live_sec_884920' },
    { network: 'buygoods', name: 'BuyGoods S2S Channel', token: 'bg_live_sec_119284' },
    { network: 'digistore24', name: 'Digistore24 S2S Channel', token: 'ds_live_sec_994821' },
    { network: 'clickbank', name: 'ClickBank S2S Channel', token: 'cb_live_sec_772910' },
  ];

  for (const n of networks) {
    const integrationId = `int-${n.network}-01`;
    const integration: AffiliateIntegration = {
      id: integrationId,
      workspaceId: DEFAULT_WORKSPACE_ID,
      network: n.network,
      name: n.name,
      secretToken: n.token,
      valueStrategy: 'commission',
      status: 'connected',
      createdAt: new Date().toISOString(),
    };
    db.saveIntegration(integration);

    const health: IntegrationHealth = {
      id: uuidv4(),
      workspaceId: DEFAULT_WORKSPACE_ID,
      integrationId,
      network: n.network,
      status: 'healthy',
      totalPostbacksReceived: 0,
      totalConversionsProcessed: 0,
      missingClickIdCount: 0,
      duplicateCount: 0,
      failedDeliveriesCount: 0,
      attributionRate: 100,
      deliveryRate: 100,
      updatedAt: new Date().toISOString(),
    };
    db.updateIntegrationHealth(health);
  }
}
