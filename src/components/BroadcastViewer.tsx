import React, { useEffect, useRef, useState } from 'react';
import type { BoardPage } from '../types/smartboard';
import { renderPageToDataUrl } from '../utils/canvasRenderer';

const SLIDE_WIDTH = 1280;
const SLIDE_HEIGHT = 720;

type BroadcastViewerProps = {
  /** The full page list from the workspace, used to render the current slide. */
  pages: BoardPage[];
  /** Current slide index synced from the presenter via WebSocket. */
  currentSlideIndex: number;
  /** Broadcast room ID shown to the viewer. */
  broadcastId: string;
  /** Name of the workspace / presentation. */
  workspaceName: string;
};

/**
 * BroadcastViewer -- a read-only, simplified presentation display for audience
 * members who open the broadcast URL. It receives the current slide index from
 * the presenter via WebSocket and renders that slide with no editing controls.
 */
export const BroadcastViewer: React.FC<BroadcastViewerProps> = ({
  pages,
  currentSlideIndex,
  broadcastId,
  workspaceName,
}) => {
  const [slideDataUrl, setSlideDataUrl] = useState<string>('');
  const [entered, setEntered] = useState(false);
  const prevIndexRef = useRef(currentSlideIndex);

  const activePage = pages[currentSlideIndex] || pages[0];

  // Render the current slide to an image whenever it changes
  useEffect(() => {
    if (!activePage) return;
    let cancelled = false;
    setEntered(false);
    Promise.resolve(renderPageToDataUrl(activePage, SLIDE_WIDTH, SLIDE_HEIGHT, 'image/jpeg', 0.92)).then((url) => {
      if (!cancelled) {
        setSlideDataUrl(url);
        // Trigger enter transition after a brief delay
        requestAnimationFrame(() => {
          if (!cancelled) setEntered(true);
        });
      }
    });
    prevIndexRef.current = currentSlideIndex;
    return () => {
      cancelled = true;
    };
  }, [activePage, currentSlideIndex]);

  if (!activePage) {
    return (
      <div className="fixed inset-0 bg-slate-950 flex items-center justify-center text-white">
        <p className="text-sm text-slate-400">Waiting for presenter to start broadcasting...</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-slate-950 flex flex-col select-none">
      {/* Minimal top bar */}
      <div className="h-10 px-4 border-b border-slate-800/80 bg-slate-900/95 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 animate-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9" /><path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.4" /><circle cx="12" cy="12" r="2" /><path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.4" /><path d="M19.1 4.9C23 8.8 23 15.2 19.1 19.1" /></svg>
            LIVE
          </span>
          <span className="text-xs text-slate-300 font-medium truncate">{workspaceName}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] tabular-nums text-slate-400">
            {currentSlideIndex + 1} / {pages.length}
          </span>
          <span className="text-[11px] text-slate-500 font-mono truncate max-w-32" title={broadcastId}>
            {broadcastId.slice(0, 10)}
          </span>
        </div>
      </div>

      {/* Slide display */}
      <div className="flex-1 min-h-0 flex items-center justify-center p-4 md:p-8">
        {slideDataUrl ? (
          <div
            className="relative w-full max-w-[1280px] aspect-video rounded-xl shadow-[0_30px_80px_rgba(0,0,0,0.65)] ring-1 ring-slate-800 overflow-hidden bg-white"
            style={{
              opacity: entered ? 1 : 0,
              transform: entered ? 'scale(1)' : 'scale(0.98)',
              transition: 'opacity 300ms ease-out, transform 350ms cubic-bezier(0.22, 1, 0.36, 1)',
            }}
          >
            <img src={slideDataUrl} alt={activePage.name} className="w-full h-full object-contain" />
          </div>
        ) : (
          <div className="text-slate-500 text-sm">Loading slide...</div>
        )}
      </div>

      {/* Bottom info */}
      <div className="h-8 px-4 border-t border-slate-800/60 bg-slate-900/80 flex items-center justify-center">
        <span className="text-[11px] text-slate-500">
          View-only broadcast -- slides sync automatically from the presenter
        </span>
      </div>
    </div>
  );
};
