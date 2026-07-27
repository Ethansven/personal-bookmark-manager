import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import Callback from './pages/Callback';
import Collections from './pages/Collections';
import Bookmarks from './pages/Bookmarks';
import ProtectedRoute from './components/ProtectedRoute';

const theme = createTheme({ palette: { mode: 'light' } });

export default function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <Routes>
          <Route path="/callback" element={<Callback />} />
          <Route
            path="/collections"
            element={
              <ProtectedRoute>
                <Collections />
              </ProtectedRoute>
            }
          />
          <Route
            path="/bookmarks"
            element={
              <ProtectedRoute>
                <Bookmarks />
              </ProtectedRoute>
            }
          />
          <Route path="/" element={<Navigate to="/collections" replace />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}