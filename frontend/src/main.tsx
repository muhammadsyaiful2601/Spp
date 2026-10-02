import { Component, StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.tsx'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: 60_000 } },
})

/**
 * Safety net so an unexpected render error shows a recoverable message instead of
 * a blank white page. Clearing the stale local cache is the usual fix.
 */
class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: '#f4f6f3', fontFamily: "'DM Sans', 'Segoe UI', sans-serif" }}>
        <section style={{ maxWidth: 460, display: 'grid', gap: 10, padding: 28, background: '#fff', border: '1px solid #e5eae5', borderRadius: 12, boxShadow: '0 12px 34px rgba(33,53,43,.07)' }}>
          <strong style={{ color: '#26332d', fontSize: 18 }}>Aplikasi gagal ditampilkan</strong>
          <p style={{ margin: 0, color: '#6c7871', fontSize: 13, lineHeight: 1.6 }}>
            Terjadi kesalahan saat memuat halaman. Penyebab yang paling umum adalah data
            tersimpan di browser ini sudah usang.
          </p>
          <code style={{ display: 'block', padding: '8px 10px', background: '#f4f6f3', borderRadius: 6, color: '#8a5b4f', fontSize: 11, wordBreak: 'break-word' }}>
            {this.state.error.message}
          </code>
          <button
            type="button"
            onClick={() => {
              localStorage.clear()
              sessionStorage.clear()
              window.location.reload()
            }}
            style={{ height: 38, border: 0, borderRadius: 7, background: '#24634e', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
          >
            Bersihkan cache &amp; muat ulang
          </button>
        </section>
      </main>
    )
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </AppErrorBoundary>
  </StrictMode>,
)
