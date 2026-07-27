import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Use `@UseGuards(JwtAuthGuard)` on any controller or handler that
 * requires an authenticated request. The strategy attaches `req.user`
 * with `{ sub, email? }`.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
