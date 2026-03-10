import { liveActivitySubscriptionsTable } from '../dbmodels/live-activity-subscriptions';
import { userConnectionsTable } from '../dbmodels/user-connections';
import { WsRequest } from '../utils/lambda-ws-server';

/**
 * Subscribe to live activity updates.
 * No additional authentication is needed since the WS connection
 * is already authenticated on $connect via identity token.
 */
export async function subscribe(request: WsRequest): Promise<void> {
  const subscriptionKeys = await liveActivitySubscriptionsTable.insert(request.connectionId());
  await userConnectionsTable.updateConnectionInfo(request.connectionId(), { liveActivitySubscriptionKeys: subscriptionKeys });
}

/**
 * Unsubscribe from live activity updates.
 */
export async function unsubscribe(request: WsRequest): Promise<void> {
  await liveActivitySubscriptionsTable.deleteByConnectionId(request.connectionId());
  await userConnectionsTable.updateConnectionInfo(request.connectionId(), { liveActivitySubscriptionKeys: undefined });
}
