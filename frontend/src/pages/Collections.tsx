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
  ListItemButton,
  ListItemText,
  TextField,
  Typography,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import { useNavigate } from 'react-router-dom';
import { type Bookmark, type Collection, collectionsApi } from '../api/client';
import { logout } from '../auth/auth';

export default function Collections() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Collection[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [bookmarks, setBookmarks] = useState<Record<string, Bookmark[]>>({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void refresh();
  }, []);

  async function refresh(): Promise<void> {
    try {
      const list = await collectionsApi.list();
      setItems(list);
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err.message ?? 'Failed to load collections');
    }
  }

  async function handleExpand(id: string): Promise<void> {
    if (expanded === id) {
      setExpanded(null);
      return;
    }
    setExpanded(id);
    if (!bookmarks[id]) {
      try {
        const list = await collectionsApi.listBookmarks(id);
        setBookmarks((prev) => ({ ...prev, [id]: list }));
      } catch {
        // surface the empty state gracefully
      }
    }
  }

  async function handleCreate(): Promise<void> {
    if (!newName.trim()) return;
    try {
      await collectionsApi.create(newName.trim());
      setNewName('');
      setDialogOpen(false);
      await refresh();
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err.message ?? 'Failed to create collection');
    }
  }

  async function handleDelete(id: string): Promise<void> {
    try {
      await collectionsApi.remove(id);
      await refresh();
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err.message ?? 'Failed to delete collection');
    }
  }

  async function handleLogout(): Promise<void> {
    await logout();
    window.location.href = '/login';
  }

  return (
    <Box sx={{ maxWidth: 720, mx: 'auto', p: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h4">My collections</Typography>
        <Box>
          <Button onClick={() => navigate('/bookmarks')}>Bookmarks</Button>
          <Button onClick={handleLogout}>Log out</Button>
        </Box>
      </Box>

      {error && (
        <Typography color="error" sx={{ mb: 2 }}>
          {error}
        </Typography>
      )}

      <Button variant="contained" onClick={() => setDialogOpen(true)} sx={{ mb: 2 }}>
        New collection
      </Button>

      <List>
        {items.length === 0 && (
          <Typography color="text.secondary">No collections yet.</Typography>
        )}
        {items.map((c) => (
          <Card key={c.id} sx={{ mb: 1 }}>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <ListItemButton
                  onClick={() => {
                    void handleExpand(c.id);
                  }}
                >
                  <ListItemText primary={c.name} />
                </ListItemButton>
                <IconButton
                  aria-label="delete"
                  onClick={() => {
                    void handleDelete(c.id);
                  }}
                >
                  <DeleteIcon />
                </IconButton>
              </Box>
              {expanded === c.id && (
                <List dense>
                  {(bookmarks[c.id] ?? []).map((b) => (
                    <Box key={b.id} sx={{ pl: 2 }}>
                      <Typography variant="body2">{b.title}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {b.url}
                      </Typography>
                    </Box>
                  ))}
                  {(bookmarks[c.id] ?? []).length === 0 && (
                    <Typography variant="body2" color="text.secondary" sx={{ pl: 2 }}>
                      No bookmarks in this collection.
                    </Typography>
                  )}
                </List>
              )}
            </CardContent>
          </Card>
        ))}
      </List>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)}>
        <DialogTitle>New collection</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Name"
            fullWidth
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleCreate} variant="contained">
            Create
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
