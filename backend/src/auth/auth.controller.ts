// Auth controllers — login, callback, /auth/me alias, logout, config.
//
// Two controllers in one file:
//   - CallbackController @ /  → /callback (Auth0 sends users here).
//   - AuthController    @ /auth → /auth/login, /auth/me, /auth/logout, /auth/config.

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  Logger,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService, type PkceSession } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser } from './current-user.decorator';
import type { AuthenticatedUser } from './auth.types';
import { UsersService } from '../users/users.service';

interface CallbackQuery {
  code?: string;
  state?: string;
  error?: string;
  error_description?: string;
}

interface LogoutBody {
  refresh_token?: string;
}

interface PkceSessionRequest extends Request {
  session: Request['session'] & { pkce?: PkceSession };
}

function errHtml(detail: string): string {
  return `<!doctype html><html><body><h1>Sign-in failed</h1><pre>${detail}</pre></body></html>`;
}

@Controller()
export class CallbackController {
  private readonly logger = new Logger(CallbackController.name);

  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
  ) {}

  /**
   * GET /callback — Auth0 redirects the browser here after the user signs
   * in. We verify state, exchange code+verifier for tokens, upsert the
   * local User, then serve an HTML page that hands the tokens to the SPA.
   */
  @Get('callback')
  async callback(
    @Query() q: CallbackQuery,
    @Req() req: PkceSessionRequest,
    @Res() res: Response,
  ): Promise<void> {
    try {
      if (q.error) {
        res.status(400).send(errHtml(q.error_description ?? q.error));
        return;
      }
      if (!q.code || !q.state) {
        throw new BadRequestException({
          code: 'bad_callback',
          message: 'Missing code or state.',
        });
      }
      const session = req.session.pkce;
      if (!session || session.state !== q.state) {
        throw new BadRequestException({
          code: 'state_mismatch',
          message: 'State did not match. Possible CSRF.',
        });
      }

      const tokens = await this.auth.exchangeCodeForTokens(
        q.code,
        session.codeVerifier,
      );
      const idPayload = await this.auth.verifyIdToken(
        tokens.id_token,
        session.nonce,
      );

      const sub = idPayload.sub as string;
      const email =
        typeof idPayload.email === 'string'
          ? idPayload.email
          : `${sub}@unknown.local`;

      await this.users.ensureExists({ sub, email });

      delete req.session.pkce;

      const targetOrigin =
        process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173';
      const payload = {
        type: 'auth0-callback',
        access_token: tokens.access_token,
        id_token: tokens.id_token,
        refresh_token: tokens.refresh_token ?? null,
        expires_in: tokens.expires_in,
        returnTo: session.returnTo ?? '/collections',
      };
      const target = `${targetOrigin}/auth/callback?p=${encodeURIComponent(
        JSON.stringify(payload),
      )}`;
      const html = `<!doctype html>
<html><head><title>Signing you in…</title></head>
<body>
<script>
(function () {
  try { localStorage.setItem('bbl_tokens', JSON.stringify(${JSON.stringify(payload)})); } catch (e) {}
  window.location.replace(${JSON.stringify(target)});
})();
</script>
</body></html>`;
      res.setHeader('content-type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (e) {
      if (e instanceof HttpException) {
        const status = e.getStatus();
        const body = e.getResponse();
        const message =
          typeof body === 'string'
            ? body
            : ((body as { message?: string }).message ?? e.message);
        res.status(status).send(errHtml(message));
        return;
      }
      const detail = e instanceof Error ? `${e.message}\n${e.stack}` : String(e);
      this.logger.error(`callback failed: ${detail}`);
      res.status(500).send(errHtml(detail));
    }
  }
}

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
  ) {}

  /**
   * GET /auth/login — kicks off the PKCE flow.
   * Optional ?returnTo=... is preserved across the round-trip.
   */
  @Get('login')
  async login(
    @Query('returnTo') returnTo: string | undefined,
    @Req() req: PkceSessionRequest,
    @Res() res: Response,
  ): Promise<void> {
    const session = this.auth.createPkceSession(returnTo);
    req.session.pkce = session;
    const url = this.auth.buildAuthorizationUrl(session);
    res.redirect(302, url);
  }

  /**
   * GET /auth/me — alias for /me so Auth0-style clients work without
   * surprise. Same lazy-upsert behaviour.
   */
  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser): Promise<{
    id: string;
    email: string | null;
    createdAt: Date;
  }> {
    const row = await this.users.ensureExists(user);
    return { id: row.id, email: row.email, createdAt: row.createdAt };
  }

  /**
   * GET /auth/config — public client config the SPA may want.
   * Read-only; no secrets.
   */
  @Get('config')
  config() {
    return this.auth.publicConfig();
  }

  /**
   * POST /auth/logout — clears the express-session cookie. SPA must also
   * clear its localStorage tokens. Auth0 RP-initiated logout would need
   * the Auth0 session id, which we don't track; documented in ADR-005.
   */
  @HttpCode(204)
  @Post('logout')
  async logout(
    @Req() req: PkceSessionRequest,
    @Res({ passthrough: true }) res: Response,
    @Body() _body: LogoutBody,
  ): Promise<void> {
    await new Promise<void>((resolve) => {
      (req.session as { destroy: (cb: () => void) => void }).destroy(() =>
        resolve(),
      );
    });
    res.clearCookie('connect.sid');
  }
}