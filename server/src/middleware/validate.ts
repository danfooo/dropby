import { Request, Response, NextFunction } from 'express';
import type { ZodType } from 'zod';

// Check the request body against its schema from @dropby/shared before the handler
// runs, and hand the handler the parsed (converted) body. A malformed body gets
// 400 INVALID_REQUEST with the problems listed, instead of reaching code that assumes
// a string is a string.
export function validateBody(schema: ZodType) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) {
      return res.status(400).json({
        error: 'INVALID_REQUEST',
        issues: result.error.issues.map(i => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    req.body = result.data;
    next();
  };
}
