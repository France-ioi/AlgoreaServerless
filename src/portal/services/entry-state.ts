import { HandlerFunction } from 'lambda-api';

function get(): { payment: { state: string } } {
  return {
    payment: {
      state: 'unpaid',
    },
  };
}

export const getEntryState: HandlerFunction = get;
