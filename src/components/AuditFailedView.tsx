import React from 'react';
import { AlertCircle, RefreshCw, ArrowLeft, Globe, HelpCircle, ShieldAlert, WifiOff } from 'lucide-react';
import type { AuditErrorDetails } from '../types';
import { safeString } from '../utils/formatError';

interface AuditFailedViewProps {
  url: string;
  errorMessage: string;
  errorDetails?: AuditErrorDetails | null;
  onRetry: () => void;
  onReset: () => void;
}

export const AuditFailedView: React.FC<AuditFailedViewProps> = ({
  url,
  errorMessage,
  errorDetails,
  onRetry,
  onReset,
}) => {
  const getFailureBadge = () => {
    if (errorDetails?.reason === 'NXDOMAIN' || errorDetails?.reason === 'ENOTFOUND') {
      return { label: 'Domain Not Found (NXDOMAIN)', color: 'bg-red-100 text-red-700 border-red-200' };
    }
    if (errorDetails?.statusCode === 500 || errorDetails?.reason === 'HTTP_500') {
      return { label: 'Target Server Error (HTTP 500)', color: 'bg-red-100 text-red-700 border-red-200' };
    }
    if (errorDetails?.statusCode === 429 || errorDetails?.reason === 'RATE_LIMITED') {
      return { label: 'Rate Limited (HTTP 429)', color: 'bg-amber-100 text-amber-800 border-amber-200' };
    }
    if (errorDetails?.reason === 'ETIMEDOUT' || errorDetails?.reason === 'TIMEOUT') {
      return { label: 'Connection Timed Out', color: 'bg-amber-100 text-amber-800 border-amber-200' };
    }
    if (errorDetails?.reason === 'ECONNREFUSED') {
      return { label: 'Connection Refused', color: 'bg-red-100 text-red-700 border-red-200' };
    }
    return { label: errorDetails?.errorType || 'Crawl Execution Interrupted', color: 'bg-red-100 text-red-700 border-red-200' };
  };

  const badge = getFailureBadge();

  return (
    <div className="w-full max-w-3xl mx-auto py-8 px-4 sm:px-0">
      {/* State Progress Header showing Failed */}
      <div className="mb-6 bg-white rounded-xl border border-[#E5E5E5] p-3 shadow-xs flex items-center justify-between overflow-x-auto text-xs font-semibold">
        <div className="flex items-center gap-1 text-emerald-700">
          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
          <span>1. VALIDATING</span>
        </div>
        <span className="text-[#CCCCCC]">→</span>
        <div className="flex items-center gap-1 text-[#666666]">
          <span>2. CRAWLING</span>
        </div>
        <span className="text-[#CCCCCC]">→</span>
        <div className="flex items-center gap-1 text-[#666666]">
          <span>3. ANALYZING</span>
        </div>
        <span className="text-[#CCCCCC]">→</span>
        <div className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-red-100 text-red-700 font-bold border border-red-200">
          <span>AUDIT FAILED</span>
        </div>
      </div>

      {/* Main Error Card */}
      <div className="bg-white rounded-2xl border border-red-200 p-6 sm:p-8 shadow-[0_10px_35px_rgba(239,68,68,0.08)]">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-6 border-b border-red-100">
          <div className="flex items-start gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-red-50 border border-red-200 flex items-center justify-center text-red-600 shrink-0 mt-0.5">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="px-2.5 py-0.5 rounded text-xs font-bold uppercase tracking-wider bg-red-600 text-white">
                  AUDIT FAILED
                </span>
                <span className={`px-2.5 py-0.5 rounded text-xs font-bold border ${badge.color}`}>
                  {safeString(badge.label)}
                </span>
              </div>
              <h2 className="font-['Poppins'] text-2xl font-bold text-[#000000]">
                Website Audit Could Not Complete
              </h2>
              <div className="flex items-center gap-2 text-xs sm:text-sm text-[#666666] mt-1 font-mono">
                <Globe className="w-3.5 h-3.5 text-[#888888]" />
                <span className="truncate max-w-sm">{safeString(url)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Clear error message */}
        <div className="my-6 p-4 rounded-xl bg-red-50/60 border border-red-200">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div className="text-sm text-[#222222] leading-relaxed">
              <span className="font-bold block text-red-900 mb-1">What went wrong:</span>
              <p>{safeString(errorMessage, 'The crawler encountered an unexpected error while trying to reach this website.')}</p>
            </div>
          </div>
        </div>

        {/* Diagnostic breakdown */}
        <div className="mb-6 p-4 rounded-xl bg-[#FAFAFA] border border-[#E5E5E5] text-xs text-[#555555] space-y-2">
          <span className="font-bold uppercase tracking-wider text-[#333333] block mb-1">
            Diagnostic Summary:
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-mono">
            <div>
              <span className="text-[#888888]">Target Host: </span>
              <span className="text-[#111111] font-semibold">{safeString(url)}</span>
            </div>
            <div>
              <span className="text-[#888888]">Status / Code: </span>
              <span className="text-red-700 font-semibold">{safeString(errorDetails?.reason, 'CRAWL_INTERRUPTED')}</span>
            </div>
            {errorDetails?.statusCode && (
              <div>
                <span className="text-[#888888]">HTTP Status: </span>
                <span className="text-[#111111] font-semibold">{errorDetails.statusCode}</span>
              </div>
            )}
            <div>
              <span className="text-[#888888]">UI Guard: </span>
              <span className="text-emerald-700 font-semibold">Protected (No blank page)</span>
            </div>
          </div>

          <div className="pt-2 border-t border-[#EAEAEA] flex items-center gap-1.5 text-[#666666]">
            <HelpCircle className="w-3.5 h-3.5 text-[#F29627] shrink-0" />
            <span>
              Tip: Verify domain spelling, ensure the website server is online, and check that firewall or rate-limiting rules allow crawler connections.
            </span>
          </div>
        </div>

        {/* Action Buttons: Try Again + Change URL */}
        <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
          <button
            type="button"
            onClick={onRetry}
            className="w-full sm:w-auto flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#F29627] hover:bg-[#E0851A] text-white font-bold text-sm shadow-md transition-all active:scale-[0.99]"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Try Again</span>
          </button>

          <button
            type="button"
            onClick={onReset}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-white border border-[#CCCCCC] hover:bg-[#F5F5F5] text-[#333333] font-semibold text-sm transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Audit Another Website</span>
          </button>
        </div>
      </div>
    </div>
  );
};
export default AuditFailedView;
