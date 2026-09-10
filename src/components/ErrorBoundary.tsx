import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home, ShieldAlert } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an unhandled React error:', error, errorInfo);
    this.setState({ error, errorInfo });
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onReset) {
      this.props.onReset();
    } else {
      window.location.reload();
    }
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-[#F8F9FA] flex flex-col items-center justify-center p-4 sm:p-6 text-[#000000]">
          <div className="w-full max-w-lg bg-white rounded-2xl border border-red-200 shadow-xl p-6 sm:p-8">
            <div className="flex items-center gap-3 pb-4 border-b border-red-100">
              <div className="w-12 h-12 rounded-xl bg-red-50 border border-red-200 flex items-center justify-center text-red-600 shrink-0">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <span className="inline-block px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider bg-red-100 text-red-700 mb-1">
                  Rendering Safeguard
                </span>
                <h2 className="text-xl font-bold font-['Poppins'] text-[#000000]">
                  Application Display Error
                </h2>
              </div>
            </div>

            <div className="mt-4 text-sm text-[#555555] leading-relaxed">
              <p>
                An unexpected interface rendering issue occurred. To ensure no data is lost or left in an inconsistent state,
                the application caught this error safely instead of showing a blank page.
              </p>
              {this.state.error?.message && (
                <div className="mt-3 p-3 bg-red-50/70 rounded-xl border border-red-100 font-mono text-xs text-red-800 break-words">
                  <span className="font-bold">Error: </span>
                  {this.state.error.message}
                </div>
              )}
            </div>

            <div className="mt-6 flex flex-col sm:flex-row items-center gap-3">
              <button
                type="button"
                onClick={this.handleReset}
                className="w-full sm:w-auto flex-1 flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#000000] text-white font-semibold text-sm hover:bg-[#222222] transition-colors shadow-xs"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Try Again</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  window.location.href = '/';
                }}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-white border border-[#E5E5E5] text-[#333333] font-semibold text-sm hover:bg-[#F5F5F5] transition-colors"
              >
                <Home className="w-4 h-4" />
                <span>Go to Home</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
export default ErrorBoundary;
