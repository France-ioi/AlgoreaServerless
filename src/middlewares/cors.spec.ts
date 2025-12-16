import corsMiddleware from './cors';

describe('CORS Middleware', () => {

  it('should call res.cors({}) on response object', () => {
    const mockRequest = {} as any;
    const mockResponse = {
      cors: jest.fn(),
    } as any;
    const mockNext = jest.fn();

    corsMiddleware(mockRequest, mockResponse, mockNext);

    expect(mockResponse.cors).toHaveBeenCalledWith({});
    expect(mockResponse.cors).toHaveBeenCalledTimes(1);
  });

  it('should call next() to continue middleware chain', () => {
    const mockRequest = {} as any;
    const mockResponse = {
      cors: jest.fn(),
    } as any;
    const mockNext = jest.fn();

    corsMiddleware(mockRequest, mockResponse, mockNext);

    expect(mockNext).toHaveBeenCalledTimes(1);
    expect(mockNext).toHaveBeenCalledWith();
  });

  it('should call cors before next', () => {
    const callOrder: string[] = [];
    const mockRequest = {} as any;
    const mockResponse = {
      cors: jest.fn(() => callOrder.push('cors')),
    } as any;
    const mockNext = jest.fn(() => callOrder.push('next'));

    corsMiddleware(mockRequest, mockResponse, mockNext);

    expect(callOrder).toEqual([ 'cors', 'next' ]);
  });

});

