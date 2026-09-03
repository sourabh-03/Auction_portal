export type PrincipalKind = 'team' | 'vendor';

export interface JwtPayload {
  sub: string;
  kind: PrincipalKind;
  email: string;
}

export interface AuthenticatedUser {
  id: string;
  kind: PrincipalKind;
  email: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    // Passport already augments Request.user via its own Express.User
    // interface — extend that instead of redeclaring `user` directly, or
    // the two declarations conflict on the property's type.
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    interface User extends AuthenticatedUser {}
  }
}
