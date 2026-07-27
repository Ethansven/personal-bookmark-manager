import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { passportJwtSecret } from 'jwks-rsa';
import type { Auth0AccessTokenPayload } from './auth.types';

/**
 * Passport strategy that validates Auth0 JWT **access tokens** (not id tokens)
 * against the live JWKS. Required by ADR-001 and CLAUDE.md.
 *
 * Validation:
 *   - signature via JWKS at AUTH0_ISSUER + .well-known/jwks.json
 *   - issuer must match AUTH0_ISSUER
 *   - audience must include AUTH0_AUDIENCE
 *   - exp is enforced by passport-jwt by default
 */
@Injectable()
export class JwtStrategy
  extends PassportStrategy(Strategy, 'jwt')
  implements OnModuleInit
{
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(config: ConfigService) {
    const issuer = config.get<string>('AUTH0_ISSUER');
    const audience = config.get<string>('AUTH0_AUDIENCE');

    if (!issuer || !audience) {
      throw new Error(
        'AUTH0_ISSUER and AUTH0_AUDIENCE must be set in the environment.',
      );
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      audience,
      issuer,
      algorithms: ['RS256'],
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 10,
        jwksUri: `${issuer.replace(/\/$/, '')}/.well-known/jwks.json`,
      }),
    });
  }

  onModuleInit(): void {
    this.logger.log(
      `JWT strategy wired: issuer + audience validated, RS256 via JWKS`,
    );
  }

  /**
   * passport-jwt calls this after signature + issuer + audience + exp pass.
   * Whatever we return becomes `req.user`. We expose only what the
   * application actually needs.
   */
  validate(payload: Auth0AccessTokenPayload): { sub: string; email?: string } {
    return { sub: payload.sub, email: payload.email };
  }
}
