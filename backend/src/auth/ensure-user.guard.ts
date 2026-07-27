import {
  CanActivate,
  ExecutionContext,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import type { Request } from 'express';
import { UsersService } from '../users/users.service';
import type { AuthenticatedUser } from './auth.types';

/**
 * Runs after JwtAuthGuard to lazily provision the local User row.
 *
 * Why this exists: every ownerId FK target must exist before any
 * insert into Collection/Bookmark. The lazy-upsert strategy (see
 * UsersService) means the row only gets created on the first authed
 * request — so we have to guarantee the upsert actually runs before
 * the controller hits Prisma. Doing it in the repo would scatter the
 * concern; doing it in a guard keeps it one place and one check.
 *
 * Behaviour:
 *   - Unauthenticated (no req.user): pass through. JwtAuthGuard will
 *     already have rejected with 401.
 *   - Authenticated: call ensureExists; throw 500 on unexpected
 *     failure so the error filter logs it.
 */
@Injectable()
export class EnsureUserGuard implements CanActivate {
  constructor(private readonly users: UsersService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const user = req.user as AuthenticatedUser | undefined;
    if (!user || !user.sub) {
      return true;
    }
    try {
      await this.users.ensureExists(user);
    } catch {
      throw new InternalServerErrorException(
        'Could not provision user row.',
      );
    }
    return true;
  }
}