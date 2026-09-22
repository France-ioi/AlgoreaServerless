import { EventEnvelope } from '../../utils/lambda-eventbus-server';
import { GroupResultsExportCompletedPayload } from '../../events/group-results-export-completed';

const mockNotifyUser = jest.fn();
const mockParseSignatureOnly = jest.fn();

jest.mock('../../services/notify-user', () => ({
  notifyUser: (...args: unknown[]) => mockNotifyUser(...args),
}));

jest.mock('../token', () => ({
  parseGroupResultsTokenSignatureOnly: (...args: unknown[]) => mockParseSignatureOnly(...args),
}));

import { handleExportCompleted } from './on-export-completed';

function createSuccessPayload(
  overrides?: Partial<Extract<GroupResultsExportCompletedPayload, { status: 'success' }>>,
): Extract<GroupResultsExportCompletedPayload, { status: 'success' }> {
  return {
    export_id: '8d3f0b7e-1234-4abc-9def-1234567890ab',
    status: 'success',
    token: 'group-results-jwt',
    user_id: '999',
    group_id: '999',
    group_name: 'Classe 3B',
    items: [{ id: '210', title: 'Chapitre 1' }],
    filename: 'groups_progress_with_answers_for_group-456-and_child_items_of-210.zip',
    size_bytes: 12345678,
    error: null,
    ...overrides,
  };
}

function createFailurePayload(
  overrides?: Partial<Extract<GroupResultsExportCompletedPayload, { status: 'failure' }>>,
): Extract<GroupResultsExportCompletedPayload, { status: 'failure' }> {
  return {
    export_id: '8d3f0b7e-1234-4abc-9def-1234567890ab',
    status: 'failure',
    token: 'group-results-jwt',
    user_id: '999',
    group_id: '999',
    group_name: 'Classe 3B',
    items: [{ id: '210', title: 'Chapitre 1' }],
    filename: null,
    size_bytes: null,
    error: 'too_many_users',
    ...overrides,
  };
}

function createEnvelope(): EventEnvelope {
  return {
    version: '1.0',
    type: 'group_results_export_completed',
    source_app: 'algoreabackend',
    instance: 'dev',
    time: new Date().toISOString(),
    request_id: 'req-1',
    payload: {},
  };
}

describe('handleExportCompleted', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParseSignatureOnly.mockResolvedValue({
      userId: '123',
      groupId: '456',
      itemIds: [ '210' ],
      raw: 'group-results-jwt',
    });
    mockNotifyUser.mockResolvedValue(1);
  });

  it('should notify with group_results_export.ready on success using token claims', async () => {
    const payload = createSuccessPayload();
    await handleExportCompleted(payload, createEnvelope());

    expect(mockParseSignatureOnly).toHaveBeenCalledWith(
      'group-results-jwt',
      process.env.BACKEND_PUBLIC_KEY,
    );
    expect(mockNotifyUser).toHaveBeenCalledWith('123', {
      notificationType: 'group_results_export.ready',
      payload: {
        exportId: payload.export_id,
        groupId: '456',
        groupName: 'Classe 3B',
        items: [{ id: '210', title: 'Chapitre 1' }],
        filename: payload.filename,
        sizeBytes: 12345678,
        expiresAt: expect.any(Number),
      },
    });
    const expiresAt = mockNotifyUser.mock.calls[0][1].payload.expiresAt as number;
    expect(expiresAt).toBeGreaterThan(Date.now());
  });

  it('should notify with group_results_export.failed on failure', async () => {
    const payload = createFailurePayload();
    await handleExportCompleted(payload, createEnvelope());

    expect(mockNotifyUser).toHaveBeenCalledWith('123', {
      notificationType: 'group_results_export.failed',
      payload: {
        exportId: payload.export_id,
        groupId: '456',
        groupName: 'Classe 3B',
        items: [{ id: '210', title: 'Chapitre 1' }],
        error: 'too_many_users',
      },
    });
  });

  it('should skip notify when token verification fails', async () => {
    mockParseSignatureOnly.mockRejectedValue(new Error('bad token'));
    await handleExportCompleted(createSuccessPayload(), createEnvelope());
    expect(mockNotifyUser).not.toHaveBeenCalled();
  });
});
