import { useCallback, useEffect, useState } from "react";
import { Eraser, ExternalLink, Minus, Plus, SquareTerminal } from "lucide-react";
import {
  DesktopUpdateTitlebarButton,
  type useDesktopUpdates,
} from "../../components/DesktopUpdateControls";
import {
  getWorkspaceEntrySystemIcon,
  openWorkspaceEntryInDefaultApp,
} from "../../lib/localFiles";
import {
  DEFAULT_DESKTOP_ZOOM,
  DESKTOP_ZOOM_LEVELS,
  type DesktopZoomLevel,
} from "../../preferences";

type DesktopUpdatesController = ReturnType<typeof useDesktopUpdates>;

type DesktopTitlebarActionsProps = {
  activeFilePath: string | null;
  desktopZoom: DesktopZoomLevel;
  desktopUpdates: DesktopUpdatesController;
  terminalSidebarOpen: boolean;
  terminalToolEnabled: boolean;
  workspacePath: string | null;
  onClearTerminal: () => void;
  onDesktopZoomChange: (zoom: DesktopZoomLevel) => void;
  onToggleTerminal: () => void;
  onUpdateNow: () => void;
};

export function DesktopTitlebarActions({
  activeFilePath,
  desktopZoom,
  desktopUpdates,
  terminalSidebarOpen,
  terminalToolEnabled,
  workspacePath,
  onClearTerminal,
  onDesktopZoomChange,
  onToggleTerminal,
  onUpdateNow,
}: DesktopTitlebarActionsProps) {
  return (
    <>
      <DesktopUpdateTitlebarButton
        state={desktopUpdates.state}
        onUpdateNow={onUpdateNow}
      />
      <DesktopZoomTitlebarControls
        zoom={desktopZoom}
        onChange={onDesktopZoomChange}
      />
      <OpenInDefaultAppTitlebarButton
        activeFilePath={activeFilePath}
        workspacePath={workspacePath}
      />
      {terminalToolEnabled && terminalSidebarOpen && (
        <button
          className="desktop-titlebar-action"
          type="button"
          title="Clear terminal"
          aria-label="Clear terminal"
          onClick={onClearTerminal}
        >
          <Eraser size={15} />
        </button>
      )}
      {terminalToolEnabled && (
        <button
          className="desktop-titlebar-action"
          type="button"
          title={terminalSidebarOpen ? "Hide terminal" : "Show terminal"}
          aria-label={terminalSidebarOpen ? "Hide terminal" : "Show terminal"}
          aria-pressed={terminalSidebarOpen}
          onClick={onToggleTerminal}
        >
          <SquareTerminal size={16} />
        </button>
      )}
    </>
  );
}

type DesktopZoomTitlebarControlsProps = {
  zoom: DesktopZoomLevel;
  onChange: (zoom: DesktopZoomLevel) => void;
};

function DesktopZoomTitlebarControls({
  zoom,
  onChange,
}: DesktopZoomTitlebarControlsProps) {
  const zoomIndex = DESKTOP_ZOOM_LEVELS.indexOf(zoom);
  const normalizedIndex = zoomIndex >= 0 ? zoomIndex : DESKTOP_ZOOM_LEVELS.indexOf(DEFAULT_DESKTOP_ZOOM);
  const canZoomOut = normalizedIndex > 0;
  const canZoomIn = normalizedIndex < DESKTOP_ZOOM_LEVELS.length - 1;

  return (
    <div className="desktop-titlebar-zoom-controls" aria-label="Window zoom">
      <button
        className="desktop-titlebar-action desktop-titlebar-zoom-step"
        type="button"
        title="Zoom out"
        aria-label="Zoom out"
        disabled={!canZoomOut}
        onClick={() => {
          if (canZoomOut) onChange(DESKTOP_ZOOM_LEVELS[normalizedIndex - 1]);
        }}
      >
        <Minus size={14} />
      </button>
      <button
        className="desktop-titlebar-action desktop-titlebar-zoom-reset"
        type="button"
        title="Reset zoom to 100%"
        aria-label="Reset zoom to 100%"
        disabled={zoom === DEFAULT_DESKTOP_ZOOM}
        onClick={() => onChange(DEFAULT_DESKTOP_ZOOM)}
      >
        {formatZoomLabel(zoom)}
      </button>
      <button
        className="desktop-titlebar-action desktop-titlebar-zoom-step"
        type="button"
        title="Zoom in"
        aria-label="Zoom in"
        disabled={!canZoomIn}
        onClick={() => {
          if (canZoomIn) onChange(DESKTOP_ZOOM_LEVELS[normalizedIndex + 1]);
        }}
      >
        <Plus size={14} />
      </button>
    </div>
  );
}

type OpenInDefaultAppTitlebarButtonProps = {
  activeFilePath: string | null;
  workspacePath: string | null;
};

function OpenInDefaultAppTitlebarButton({
  activeFilePath,
  workspacePath,
}: OpenInDefaultAppTitlebarButtonProps) {
  const [iconDataUrl, setIconDataUrl] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const visible = Boolean(workspacePath && activeFilePath);

  useEffect(() => {
    if (!workspacePath || !activeFilePath) {
      setIconDataUrl(null);
      return undefined;
    }

    let cancelled = false;
    setIconDataUrl(null);
    void getWorkspaceEntrySystemIcon(workspacePath, activeFilePath)
      .then((dataUrl) => {
        if (!cancelled) setIconDataUrl(dataUrl);
      })
      .catch((error) => {
        if (!cancelled) {
          setIconDataUrl(null);
          console.warn("Unable to read system file icon:", error);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeFilePath, workspacePath]);

  const openInDefaultApp = useCallback(() => {
    if (!workspacePath || !activeFilePath || opening) return;
    setOpening(true);
    void openWorkspaceEntryInDefaultApp(workspacePath, activeFilePath)
      .catch((error) => {
        console.warn("Unable to open file with default app:", error);
      })
      .finally(() => {
        setOpening(false);
      });
  }, [activeFilePath, opening, workspacePath]);

  if (!visible) return null;

  return (
    <button
      className="desktop-titlebar-action desktop-titlebar-open-default-action"
      type="button"
      title="Open with default app"
      aria-label="Open with default app"
      disabled={opening}
      onClick={openInDefaultApp}
    >
      {iconDataUrl ? (
        <img src={iconDataUrl} alt="" aria-hidden="true" />
      ) : (
        <ExternalLink size={15} />
      )}
    </button>
  );
}

function formatZoomLabel(zoom: DesktopZoomLevel) {
  return `${Math.round(zoom * 100)}%`;
}
