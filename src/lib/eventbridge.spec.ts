import { PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { ServerError } from '../utils/errors';

const mockSend = jest.fn();

jest.mock('@aws-sdk/client-eventbridge', () => {
  const actual = jest.requireActual('@aws-sdk/client-eventbridge');
  return {
    ...actual,
    EventBridgeClient: jest.fn(() => ({ send: mockSend })),
  };
});

import { publishEvent, resetEventBridgeClient } from './eventbridge';

describe('publishEvent', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    resetEventBridgeClient();
    process.env = {
      ...originalEnv,
      STAGE: 'dev',
      EVENT_BUS_NAME: 'algorea',
    };
    mockSend.mockResolvedValue({ FailedEntryCount: 0, Entries: [{ EventId: 'e1' }] });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should PutEvents with the algorea envelope', async () => {
    await publishEvent('group_results_export_requested', { export_id: 'x' }, 'req-42');

    expect(mockSend).toHaveBeenCalledTimes(1);
    const command = mockSend.mock.calls[0][0] as PutEventsCommand;
    expect(command).toBeInstanceOf(PutEventsCommand);
    const entry = command.input.Entries?.[0];
    expect(entry?.EventBusName).toBe('algorea');
    expect(entry?.Source).toBe('algoreaserverless.dev');
    expect(entry?.DetailType).toBe('group_results_export_requested');

    const detail = JSON.parse(entry?.Detail ?? '{}');
    expect(detail).toMatchObject({
      version: '1.0',
      type: 'group_results_export_requested',
      source_app: 'algoreaserverless',
      instance: 'dev',
      request_id: 'req-42',
      payload: { export_id: 'x' },
    });
    expect(detail.time).toEqual(expect.any(String));
  });

  it('should throw ServerError when PutEvents reports failures', async () => {
    mockSend.mockResolvedValue({
      FailedEntryCount: 1,
      Entries: [{ ErrorCode: 'Throttling', ErrorMessage: 'slow' }],
    });
    await expect(publishEvent('t', {})).rejects.toThrow(ServerError);
  });

  it('should throw when EVENT_BUS_NAME is missing', async () => {
    delete process.env.EVENT_BUS_NAME;
    await expect(publishEvent('t', {})).rejects.toThrow(ServerError);
  });
});
