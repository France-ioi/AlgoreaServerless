import { NextFunction, Request, Response } from 'lambda-api';

function errorHandler(err: Error, req: Request, res: Response, next: NextFunction): void {
  if (err.name === 'DecodingError') {
    res.status(400).json({ message: 'decoding error', details: err.message });
    return;
  }
  if (err.name === 'AuthenticationError') {
    res.status(401).json({ message: 'authentication error', details: err.message });
    return;
  }
  if (err.name === 'Forbidden') {
    res.status(403).json({ message: 'forbidden', details: err.message });
    return;
  }
  if (err.name === 'RouteError') {
    res.status(404).json({ message: 'route error', details: { method: req.method, path: req.path } });
    return;
  }
  if (err.name === 'DBError') {
    res.status(500).json({ message: 'db error', details: err });
    return;
  }
  if (err instanceof Error) {
    res.status(500).json({ message: 'internal server error', details: String(err) });
    return;
  }
  next();
}

export default errorHandler;
