import { useEffect, useState } from 'react';
import { Box, CircularProgress, Typography } from '@mui/material';
import { getAccessToken, startLogin } from '../auth/auth';

/**
 * Wraps protected routes. If we have no access token, kicks the user
 * through the backend /auth/login round-trip (which redirects to Auth0
 * and back). While deciding, shows a small loading state.
 */
export default function ProtectedRoute({
  children,
}: {
  children: React.ReactNode;
}) {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const t = getAccessToken();
    if (t) {
      setToken(t);
      return;
    }
    startLogin(window.location.pathname);
  }, []);

  if (!token) {
    return (
      <Box sx={{ p: 4, display: 'flex', gap: 2, alignItems: 'center' }}>
        <CircularProgress size={20} />
        <Typography>Redirecting to sign-in…</Typography>
      </Box>
    );
  }

  return <>{children}</>;
}