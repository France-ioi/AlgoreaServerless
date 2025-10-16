import { NextFunction, Request, Response } from 'lambda-api';

function errorHandler(err: Error, req: Request, res: Response, next: NextFunction): void {
  if (err.name === 'DecodingError') {
    res.status(400).send({ message: 'decoding error', details: JSON.stringify(err) });
    return;
  }
  if (err.name === 'Forbidden') {
    res.status(403).send({ message: 'forbidden', details: JSON.stringify(err) });
    return;
  }
  if (err.name === 'RouteError') {
    res.status(404).send({ message: 'route error', details: { method: req.method, path: req.path } });
    return;
  }
  if (err.name === 'DBError') {
    res.status(500).send({ message: 'db error', details: JSON.stringify(err) });
    return;
  }
  if (err instanceof Error) {
    res.status(500).send({ message: 'internal server error', details: String(err) });
    return;
  }
  next();
}

export default errorHandler;
