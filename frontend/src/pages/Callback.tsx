import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { userManager } from '../auth/oidc';
import { Box, CircularProgress, Typography } from '@mui/material';

/**
 * Receives the OIDC redirect from Auth0 and finalises the login.
 * Any error here is shown to the user; success navigates to /collections.
 */
export default function Callback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    userManager
      .signinRedirectCallback()
      .then(() => navigate('/collections', { replace: true }))
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : String(err)),
      );
  }, [navigate]);

  if (error) {
    return (
      <Box sx={{ p: 4 }}>
        <Typography variant="h6" color="error">
          Login failed
        </Typography>
        <Typography>{error}</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 4, display: 'flex', alignItems: 'center', gap: 2 }}>
      <CircularProgress size={20} />
      <Typography>Completing sign-in…</Typography>
    </Box>
  );
}
