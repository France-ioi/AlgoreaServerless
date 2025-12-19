import { HandlerFunction } from 'lambda-api';
import { loadConfig } from '../../config';

function get(): { payment: { state: string } } {
  const config = loadConfig();
  const paymentState = config.portal?.payment ? 'unpaid' : 'disabled';

  return {
    payment: {
      state: paymentState,
    },
  };
}

export const getEntryState: HandlerFunction = get;
