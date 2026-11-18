import { useQuery } from "@tanstack/react-query";
import { Maximize2, Minus, Plus, X } from "lucide-react";
import { type PointerEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";

import { t } from "~/core/i18n";
import { Button, cn, Spinner } from "~/core/ui";
import { appPaths } from "~/features/menu/paths";
import { useWorkspace } from "~/features/workspaces/WorkspaceContext";

import { DRAG_ALPHA, ForceLayout, type GraphNode } from "../layout";
import {
  buildGraph,
  type GraphGrouping,
  type GraphItemDetails,
  itemDetails,
  workspaceGraphQuery,
} from "../model";

const MIN_SCALE = 0.2;
const MAX_SCALE = 4;
const BUTTON_ZOOM_STEP = 1.25;
const WHEEL_ZOOM_STEP = 1.1;
/** A press that moves less than this is a click, not a drag. */
const CLICK_SLOP = 4;
const HUB_SIZE = 9;
const LEAF_SIZE = 6;

type View = { x: number; y: number; scale: number };
type Press =
  | { kind: "node"; node: GraphNode; startX: number; startY: number; moved: boolean }
  | { kind: "pan"; startX: number; startY: number; from: View; moved: boolean };

function nodeSize(node: GraphNode): number {
  return node.isFolder ? HUB_SIZE : LEAF_SIZE;
}

/** Where a node opens: its document, its folder, or the documents of its tag. */
export function nodePath(node: Pick<GraphNode, "id" | "isFolder" | "isTag">): string {
  if (node.isTag) return appPaths.tag(node.id);
  if (node.isFolder) return appPaths.folder(node.id);
  return appPaths.document(node.id);
}

/**
 * The documents graph (NavigateDocumentGraph.kt): the folders, documents and tags of the
 * workspace as a force-directed graph. Drag the background to move, the wheel with ⌘ or Ctrl
 * (or the buttons) to zoom, drag a node to move it, click it for its card, double-click to open.
 */
export function DocumentsGraph() {
  const { workspace } = useWorkspace();
  const navigate = useNavigate();
  const [grouping, setGrouping] = useState<GraphGrouping>("folders");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const data = useQuery(workspaceGraphQuery(workspace.id));

  const graph = useMemo(
    () => (data.data ? buildGraph(data.data, grouping) : { nodes: [], links: [] }),
    [data.data, grouping],
  );
  const details = data.data && selectedId ? itemDetails(data.data, selectedId) : null;
  const selectedNode = graph.nodes.find((node) => node.id === selectedId) ?? null;

  const open = (node: Pick<GraphNode, "id" | "isFolder" | "isTag">) =>
    void navigate(nodePath(node));

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 px-4 py-2">
        <div role="radiogroup" aria-label={t("graphGrouping")} className="flex gap-1">
          {(["folders", "tags"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={grouping === value}
              onClick={() => {
                setGrouping(value);
                setSelectedId(null);
              }}
              className={cn(
                "rounded-md border px-3 py-1 text-sm",
                grouping === value
                  ? "border-accent bg-selected-bg text-on-bg"
                  : "border-card-border hover:bg-options-selector",
              )}
            >
              {value === "folders" ? t("graphByFolders") : t("graphByTags")}
            </button>
          ))}
        </div>
      </div>

      {data.isPending ? (
        <div className="flex flex-1 items-center justify-center">
          <Spinner />
        </div>
      ) : data.isError ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <p role="alert" className="text-error">
            {t("menuLoadError")}
          </p>
          <Button variant="secondary" onClick={() => void data.refetch()}>
            {t("retry")}
          </Button>
        </div>
      ) : graph.nodes.length === 0 ? (
        <p className="flex flex-1 items-center justify-center p-6 text-center text-text-light">
          {t("graphEmpty")}
        </p>
      ) : (
        <GraphCanvas
          key={grouping}
          graph={graph}
          selectedId={selectedId}
          highlightIds={details?.kind === "tag" ? details.documentIds : []}
          onSelect={setSelectedId}
          onOpen={open}
        />
      )}

      {/* The nodes as a list, for the keyboard and for screen readers. */}
      <ul aria-label={t("graphItems")} className="sr-only">
        {graph.nodes.map((node) => (
          <li key={node.id}>
            <button type="button" onClick={() => setSelectedId(node.id)}>
              {node.label || t("untitled")}
            </button>
          </li>
        ))}
      </ul>

      {details && selectedNode && (
        <GraphItemCard
          details={details}
          onOpen={() => open(selectedNode)}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

function GraphCanvas({
  graph,
  selectedId,
  highlightIds,
  onSelect,
  onOpen,
}: {
  graph: ReturnType<typeof buildGraph>;
  selectedId: string | null;
  highlightIds: string[];
  onSelect: (id: string | null) => void;
  onOpen: (node: GraphNode) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 1 });
  const [hoverId, setHoverId] = useState<string | null>(null);
  const press = useRef<Press | null>(null);
  const layoutRef = useRef<ForceLayout | null>(null);
  const frame = useRef(0);
  // What draw() reads, kept current without restarting the animation.
  const drawState = useRef({ view, size, selectedId, hoverId, highlightIds });

  // The size of the area the canvas fills.
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const measure = () => setSize({ width: element.clientWidth, height: element.clientHeight });
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const draw = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    const layout = layoutRef.current;
    if (!canvas || !context || !layout) return;
    const { view, size, selectedId, hoverId, highlightIds } = drawState.current;
    const ratio = window.devicePixelRatio || 1;
    if (canvas.width !== size.width * ratio || canvas.height !== size.height * ratio) {
      canvas.width = size.width * ratio;
      canvas.height = size.height * ratio;
    }

    const styles = getComputedStyle(document.documentElement);
    const color = (name: string, fallback: string) =>
      styles.getPropertyValue(name).trim() || fallback;
    const accent = color("--color-accent", "#7c4dff");
    const text = color("--color-on-bg", "#111");
    const muted = color("--color-text-lighter", "#888");
    const line = color("--color-divider", "#ccc");
    const tagColor = color("--color-accent-secondary", "#ff9800");
    const highlighted = new Set(highlightIds);

    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, size.width, size.height);
    const cx = size.width / 2;
    const cy = size.height / 2;
    // Scaled around the centre of the viewport, then moved.
    context.translate(cx + view.x, cy + view.y);
    context.scale(view.scale, view.scale);
    context.translate(-cx, -cy);

    context.lineWidth = 1 / view.scale;
    context.strokeStyle = line;
    context.beginPath();
    for (const { source, target } of layout.links) {
      context.moveTo(source.x, source.y);
      context.lineTo(target.x, target.y);
    }
    context.stroke();

    context.textAlign = "center";
    context.textBaseline = "top";
    context.font = `${11 / Math.max(view.scale, 0.75)}px system-ui, sans-serif`;
    for (const node of layout.nodes) {
      const active = node.id === selectedId || node.id === hoverId || highlighted.has(node.id);
      const radius = nodeSize(node) * (active ? 1.3 : 1);
      context.beginPath();
      context.arc(node.x, node.y, radius, 0, Math.PI * 2);
      context.fillStyle = node.isTag ? tagColor : node.isFolder ? accent : muted;
      context.fill();
      if (active) {
        context.lineWidth = 2 / view.scale;
        context.strokeStyle = accent;
        context.stroke();
      }
      if (view.scale >= 0.6 || active) {
        context.fillStyle = active ? text : muted;
        context.fillText(node.label || t("untitled"), node.x, node.y + radius + 3, 160);
      }
    }
  };

  const animate = () => {
    cancelAnimationFrame(frame.current);
    const step = () => {
      const layout = layoutRef.current;
      if (!layout) return;
      const { size } = drawState.current;
      layout.tick(size.width / 2, size.height / 2);
      draw();
      if (!layout.isSettled) frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
  };

  // The layout of this graph: placed, warmed up, then cooled frame by frame. It starts once
  // the area has a size; a later resize only redraws.
  const hasSize = size.width > 0 && size.height > 0;
  useEffect(() => {
    if (!hasSize) return;
    const { size } = drawState.current;
    const layout = new ForceLayout(graph.nodes, graph.links);
    layoutRef.current = layout;
    layout.placeRadially(size.width / 2, size.height / 2);
    layout.warmUp(size.width / 2, size.height / 2);
    animate();
    return () => cancelAnimationFrame(frame.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- draw and animate read refs
  }, [graph, hasSize]);

  // Anything that changes the picture without moving the nodes: kept for the next frame, and
  // drawn now.
  useLayoutEffect(() => {
    drawState.current = { view, size, selectedId, hoverId, highlightIds };
    draw();
  });

  const toGraph = (clientX: number, clientY: number) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const cx = size.width / 2;
    const cy = size.height / 2;
    return {
      x: (clientX - rect.left - view.x - cx) / view.scale + cx,
      y: (clientY - rect.top - view.y - cy) / view.scale + cy,
    };
  };

  const nodeAt = (clientX: number, clientY: number): GraphNode | null => {
    const layout = layoutRef.current;
    if (!layout) return null;
    const point = toGraph(clientX, clientY);
    let best: GraphNode | null = null;
    let bestDistance = Infinity;
    for (const node of layout.nodes) {
      const distance = Math.hypot(node.x - point.x, node.y - point.y);
      const reach = nodeSize(node) + 6 / view.scale;
      if (distance <= reach && distance < bestDistance) {
        best = node;
        bestDistance = distance;
      }
    }
    return best;
  };

  const zoomBy = (factor: number) =>
    setView((current) => ({
      ...current,
      scale: Math.min(Math.max(current.scale * factor, MIN_SCALE), MAX_SCALE),
    }));

  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const node = nodeAt(event.clientX, event.clientY);
    press.current = node
      ? { kind: "node", node, startX: event.clientX, startY: event.clientY, moved: false }
      : { kind: "pan", startX: event.clientX, startY: event.clientY, from: view, moved: false };
  };

  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const current = press.current;
    if (!current) {
      const node = nodeAt(event.clientX, event.clientY);
      if ((node?.id ?? null) !== hoverId) setHoverId(node?.id ?? null);
      return;
    }
    const dx = event.clientX - current.startX;
    const dy = event.clientY - current.startY;
    if (!current.moved && Math.hypot(dx, dy) < CLICK_SLOP) return;
    current.moved = true;

    if (current.kind === "pan") {
      setView({ ...current.from, x: current.from.x + dx, y: current.from.y + dy });
    } else {
      const point = toGraph(event.clientX, event.clientY);
      current.node.isDragged = true;
      current.node.x = point.x;
      current.node.y = point.y;
      if (layoutRef.current?.isSettled !== false) animate();
    }
  };

  const onPointerUp = () => {
    const current = press.current;
    press.current = null;
    if (!current) return;
    if (current.kind === "node") {
      current.node.isDragged = false;
      if (current.moved) {
        layoutRef.current?.reheat(DRAG_ALPHA);
        animate();
      } else onSelect(current.node.id);
    } else if (!current.moved) {
      onSelect(null);
    }
  };

  return (
    <div ref={containerRef} className="relative min-h-0 flex-1 overflow-hidden">
      <canvas
        ref={canvasRef}
        aria-label={t("documentsGraph")}
        role="img"
        className={cn("block touch-none", hoverId ? "cursor-pointer" : "cursor-grab")}
        style={{ width: size.width, height: size.height }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => setHoverId(null)}
        onDoubleClick={(event) => {
          const node = nodeAt(event.clientX, event.clientY);
          if (node) onOpen(node);
        }}
        onWheel={(event) => {
          // A two-finger scroll moves the graph; with ⌘ or Ctrl held (or a pinch) it zooms.
          if (event.ctrlKey || event.metaKey) {
            zoomBy(event.deltaY < 0 ? WHEEL_ZOOM_STEP : 1 / WHEEL_ZOOM_STEP);
          } else {
            setView((current) => ({
              ...current,
              x: current.x - event.deltaX,
              y: current.y - event.deltaY,
            }));
          }
        }}
      />
      <div className="absolute right-3 bottom-3 flex flex-col gap-1 rounded-lg border border-card-border bg-card-bg p-1 shadow">
        <ZoomButton label={t("zoomIn")} onClick={() => zoomBy(BUTTON_ZOOM_STEP)}>
          <Plus size={16} aria-hidden />
        </ZoomButton>
        <ZoomButton label={t("zoomOut")} onClick={() => zoomBy(1 / BUTTON_ZOOM_STEP)}>
          <Minus size={16} aria-hidden />
        </ZoomButton>
        <ZoomButton label={t("zoomReset")} onClick={() => setView({ x: 0, y: 0, scale: 1 })}>
          <Maximize2 size={16} aria-hidden />
        </ZoomButton>
      </div>
    </div>
  );
}

function ZoomButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex size-8 items-center justify-center rounded-md text-on-bg hover:bg-options-selector"
    >
      {children}
    </button>
  );
}

/** GraphItemCard.kt: what the clicked node is, and the way to open it. */
function GraphItemCard({
  details,
  onOpen,
  onClose,
}: {
  details: GraphItemDetails;
  onOpen: () => void;
  onClose: () => void;
}) {
  const kind = {
    document: t("graphKindDocument"),
    folder: t("graphKindFolder"),
    tag: t("graphKindTag"),
  }[details.kind];

  return (
    <section
      aria-label={details.title || t("untitled")}
      className="absolute top-14 right-3 flex w-72 max-w-[calc(100%-1.5rem)] flex-col gap-2 rounded-lg border border-card-border bg-card-bg p-4 shadow-lg"
    >
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-xs font-bold tracking-wide text-text-lighter uppercase">
            {kind}
          </span>
          <h2 className="truncate font-medium text-on-bg">{details.title || t("untitled")}</h2>
        </div>
        <button
          type="button"
          aria-label={t("close")}
          onClick={onClose}
          className="rounded-md p-1 hover:bg-options-selector"
        >
          <X size={16} aria-hidden />
        </button>
      </div>
      <div className="text-sm text-text-light">
        {details.kind === "document" && (
          <>
            <p>{t("updatedAt", { date: new Date(details.lastUpdatedAt).toLocaleString() })}</p>
            <p>
              {details.folderName
                ? t("graphInFolder", { name: details.folderName })
                : t("graphAtRoot")}
            </p>
            {details.tagNames.length > 0 && <p>{details.tagNames.join(", ")}</p>}
          </>
        )}
        {details.kind === "folder" && (
          <p>
            {t("graphFolderCounts", {
              folders: details.folderCount,
              documents: details.documentCount,
            })}
          </p>
        )}
        {details.kind === "tag" && (
          <>
            {details.description && <p>{details.description}</p>}
            <p>{t("graphTagCount", { count: details.documentIds.length })}</p>
          </>
        )}
      </div>
      <Button className="self-start" onClick={onOpen}>
        {t("graphOpen")}
      </Button>
    </section>
  );
}
