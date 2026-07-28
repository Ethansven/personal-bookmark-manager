import { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  List,
  MenuItem,
  Select,
  TextField,
  Typography,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import { useNavigate } from 'react-router-dom';
import { type Bookmark, type Collection, bookmarksApi, collectionsApi } from '../api/client';
import { logout } from '../auth/auth';

export default function Bookmarks() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Bookmark[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [filterId, setFilterId] = useState<string>('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ url: '', title: '', notes: '', collectionId: '' });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [list, cols] = await Promise.all([
          bookmarksApi.list(),
          collectionsApi.list(),
        ]);
        setItems(list);
        setCollections(cols);
      } catch (e: unknown) {
        const err = e as { message?: string };
        setError(err.message ?? 'Failed to load');
      }
    })();
  }, []);

  async function refresh(): Promise<void> {
    try {
      const list = await bookmarksApi.list(
        filterId ? { collectionId: filterId } : undefined,
      );
      setItems(list);
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err.message ?? 'Failed to load');
    }
  }

  useEffect(() => {
    void refresh();
  }, [filterId]);

  async function handleCreate(): Promise<void> {
    if (!form.url.trim() || !form.title.trim()) return;
    try {
      await bookmarksApi.create({
        url: form.url.trim(),
        title: form.title.trim(),
        notes: form.notes || undefined,
        collectionId: form.collectionId || undefined,
      });
      setForm({ url: '', title: '', notes: '', collectionId: '' });
      setDialogOpen(false);
      await refresh();
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err.message ?? 'Failed to create bookmark');
    }
  }

  async function handleDelete(id: string): Promise<void> {
    try {
      await bookmarksApi.remove(id);
      await refresh();
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err.message ?? 'Failed to delete bookmark');
    }
  }

  async function handleLogout(): Promise<void> {
    await logout();
    window.location.href = '/login';
  }

  return (
    <Box sx={{ maxWidth: 720, mx: 'auto', p: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h4">My bookmarks</Typography>
        <Box>
          <Button onClick={() => navigate('/collections')}>Collections</Button>
          <Button onClick={handleLogout}>Log out</Button>
        </Box>
      </Box>

      {error && (
        <Typography color="error" sx={{ mb: 2 }}>
          {error}
        </Typography>
      )}

      <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
        <Select
          value={filterId}
          displayEmpty
          onChange={(e) => setFilterId(e.target.value)}
          sx={{ minWidth: 200 }}
        >
          <MenuItem value="">All collections</MenuItem>
          {collections.map((c) => (
            <MenuItem key={c.id} value={c.id}>
              {c.name}
            </MenuItem>
          ))}
        </Select>
        <Button variant="contained" onClick={() => setDialogOpen(true)}>
          New bookmark
        </Button>
      </Box>

      <List>
        {items.length === 0 && (
          <Typography color="text.secondary">No bookmarks yet.</Typography>
        )}
        {items.map((b) => (
          <Card key={b.id} sx={{ mb: 1 }}>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Box>
                  <Typography variant="h6">
                    <a href={b.url} target="_blank" rel="noreferrer">
                      {b.title}
                    </a>
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {b.url}
                  </Typography>
                  {b.notes && <Typography variant="body2">{b.notes}</Typography>}
                </Box>
                <IconButton
                  aria-label="delete"
                  onClick={() => {
                    void handleDelete(b.id);
                  }}
                >
                  <DeleteIcon />
                </IconButton>
              </Box>
            </CardContent>
          </Card>
        ))}
      </List>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)}>
        <DialogTitle>New bookmark</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="URL"
            fullWidth
            value={form.url}
            onChange={(e) => setForm({ ...form, url: e.target.value })}
          />
          <TextField
            margin="dense"
            label="Title"
            fullWidth
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
          <TextField
            margin="dense"
            label="Notes (optional)"
            fullWidth
            multiline
            minRows={2}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
          <Select
            value={form.collectionId}
            displayEmpty
            fullWidth
            onChange={(e) => setForm({ ...form, collectionId: e.target.value })}
            sx={{ mt: 1 }}
          >
            <MenuItem value="">Uncategorised</MenuItem>
            {collections.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.name}
              </MenuItem>
            ))}
          </Select>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleCreate} variant="contained">
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
