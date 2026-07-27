import { useEffect, useState } from 'react';
import { Box, Button, CircularProgress, Typography } from '@mui/material';
import { userManager } from '../auth/oidc';

/**
 * Wraps protected routes. If we don't have a user, redirects to the
 * Auth0 signin. While checking, shows a small loading state.
 */
export default function ProtectedRoute({
  children,
}: {
  children: React.ReactNode;
}) {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    userManager
      .getUser()
      .then((user) => {
        if (user && !user.expired) {
          setSignedIn(true);
          setReady(true);
          return;
        }
        setReady(true);
        void userManager.signinRedirect();
      })
      .catch(() => {
        setReady(true);
        void userManager.signinRedirect();
      });
  }, []);

  if (!ready) {
    return (
      <Box sx={{ p: 4, display: 'flex', gap: 2, alignItems: 'center' }}>
        <CircularProgress size={20} />
        <Typography>Checking session…</Typography>
      </Box>
    );
  }

  if (!signedIn) {
    return (
      <Box sx={{ p: 4 }}>
        <Typography>Redirecting to sign-in…</Typography>
        <Button onClick={() => userManager.signinRedirect()}>Sign in</Button>
      </Box>
    );
  }

  return <>{children}</>;
}
