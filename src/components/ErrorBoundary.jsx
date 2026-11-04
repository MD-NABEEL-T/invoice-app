import React from 'react';

/**
 * Global Error Boundary to prevent white screen of death on unhandled exceptions.
 * Provides user-friendly recovery with a reload button and error diagnostic details.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an unhandled error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReload = () => {
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-2xl border-2 border-red-300 p-6 shadow-lg text-center space-y-4">
            <div className="w-14 h-14 mx-auto rounded-full bg-red-100 flex items-center justify-center text-2xl text-red-700">
              ⚠️
            </div>
            <h2 className="text-xl font-black text-slate-900">
              Something went wrong
            </h2>
            <p className="text-sm font-semibold text-slate-600">
              An unexpected error occurred while rendering this page. You can safely reload the app to continue.
            </p>
            {this.state.error?.message && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-left text-xs font-mono text-slate-700 overflow-x-auto max-h-32">
                {this.state.error.message}
              </div>
            )}
            <div className="pt-2 flex flex-col sm:flex-row gap-2 justify-center">
              <button
                type="button"
                onClick={this.handleReload}
                className="px-5 py-2.5 rounded-xl bg-slate-900 text-white font-bold text-sm hover:bg-slate-800 cursor-pointer shadow-sm"
              >
                🔄 Reload App (Go to Home)
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
