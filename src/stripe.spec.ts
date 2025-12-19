import { getStripeClient } from './stripe';
import * as config from './config';

jest.mock('./config');

const mockLoadConfig = config.loadConfig as jest.MockedFunction<typeof config.loadConfig>;

describe('Stripe Client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return Stripe client when config has valid stripe key', () => {
    mockLoadConfig.mockReturnValue({
      portal: {
        payment: {
          stripe: {
            sk: 'sk_test_123456789',
          },
        },
      },
    });

    const client = getStripeClient();

    expect(client).not.toBeNull();
    expect(client).toHaveProperty('customers');
    expect(client).toHaveProperty('invoices');
  });

  it('should return null when config has no portal section', () => {
    mockLoadConfig.mockReturnValue({});

    const client = getStripeClient();

    expect(client).toBeNull();
  });

  it('should return null when config has no payment section', () => {
    mockLoadConfig.mockReturnValue({
      portal: {},
    });

    const client = getStripeClient();

    expect(client).toBeNull();
  });

  it('should return null when config has no stripe key', () => {
    mockLoadConfig.mockReturnValue({
      portal: {
        payment: {
          stripe: {
            sk: '',
          },
        },
      },
    });

    const client = getStripeClient();

    expect(client).toBeNull();
  });
});
