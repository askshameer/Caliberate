import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('Caliberate UI error:', error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <h1 className="mt-4 text-lg font-bold text-slate-900">Something went wrong</h1>
          <p className="mt-2 text-xs text-slate-500">
            The workspace hit an unexpected error. Your data is safe. Reload the page to continue.
          </p>
          {!import.meta.env.PROD && this.state.error && (
            <pre className="mt-3 max-h-32 overflow-auto rounded-lg bg-slate-950 p-3 text-left text-xs text-rose-300">
              {String(this.state.error?.message || this.state.error)}
            </pre>
          )}
          <button
            onClick={() => window.location.reload()}
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-xs font-bold text-white hover:bg-teal-800"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Reload workspace
          </button>
        </div>
      </div>
    );
  }
}
