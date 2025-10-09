import { NextFunction, Request, Response } from 'lambda-api';

function cors(_req: Request, res: Response, next: NextFunction): void {
  res.cors({});
  next();
}

export default cors;
