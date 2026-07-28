import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, CircularProgress, Typography } from '@mui/material';
import { finishCallback } from '../auth/auth';

/**
 * Receives the redirect from the backend /callback (which itself was
 * called by Auth0). Parses the token payload from ?p=... and navigates
 * to the original returnTo target.
 */
export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const target = finishCallback();
      navigate(target, { replace: true });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [navigate]);

  if (error) {
    return (
      <Box sx={{ p: 4 }}>
        <Typography variant="h6" color="error">
          Sign-in failed
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