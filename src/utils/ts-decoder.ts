import * as z from 'zod';

export const epochDate = z.codec(z.int().min(0), z.date(), {
  decode: sec => new Date(sec * 1000),
  encode: date => Math.floor(date.getTime() / 1000),
});
