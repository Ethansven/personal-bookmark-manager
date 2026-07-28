import { Button, Card, CardContent, Container, Stack, Typography } from '@mui/material';
import { startLogin } from '../auth/auth';

export default function LoginPage() {
  return (
    <Container maxWidth="sm" sx={{ py: 8 }}>
      <Card variant="outlined">
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h4">Bookmark Manager</Typography>
            <Typography color="text.secondary">
              A private read-later app. Sign in with the Bangkok Bank test tenant.
            </Typography>
            <Button
              variant="contained"
              size="large"
              onClick={() => startLogin('/collections')}
            >
              Sign in with Auth0
            </Button>
            <Typography variant="caption" color="text.secondary">
              Test user: candidate@test.com / @password1234
            </Typography>
          </Stack>
        </CardContent>
      </Card>
    </Container>
  );
}