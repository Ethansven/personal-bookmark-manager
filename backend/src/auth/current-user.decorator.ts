import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from './auth.types';

/**
 * `@CurrentUser()` returns the validated user attached by JwtStrategy.
 * Throws if used on a route that isn't guarded — which is what we want.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const req = ctx.switchToHttp().getRequest<Request>();
    if (!req.user) {
      throw new Error(
        'CurrentUser used on an unguarded route — missing @UseGuards(JwtAuthGuard).',
      );
    }
    return req.user as AuthenticatedUser;
  },
);
