
import * as React from "react";

import { Button } from "@/components/ui/button";
import { GraphNode, GraphLink } from "@/types";


interface GraphViewProps {
  nodes: GraphNode[];
  links: GraphLink[];
  onNodeClick?: (nodeId: string) => void;
}

export function GraphView({ nodes, links, onNodeClick }: GraphViewProps) {
  const svgRef = React.useRef<SVGSVGElement>(null);
  const [transform, setTransform] = React.useState({ x: 0, y: 0, scale: 1 });
  const [hoveredNode, setHoveredNode] = React.useState<string | null>(null);
  const isDragging = React.useRef(false);
  const dragStart = React.useRef({ x: 0, y: 0 });

  const nodePositions = React.useMemo(() => {
    const width = 800;
    const height = 600;
    const centerX = width / 2;
    const centerY = height / 2;

    if (nodes.length === 0) return new Map();

    const positions = new Map<string, { x: number; y: number }>();
    const radius = Math.min(width, height) / 3;

    nodes.forEach((node, i) => {
      const angle = (2 * Math.PI * i) / nodes.length;
      positions.set(node.id, {
        x: centerX + radius * Math.cos(angle) + (Math.random() - 0.5) * 50,
        y: centerY + radius * Math.sin(angle) + (Math.random() - 0.5) * 50,
      });
    });

    return positions;
  }, [nodes]);

  const handleNodeClick = (nodeId: string) => {
    if (onNodeClick) {
      onNodeClick(nodeId);
    }
  };

  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (e.target === svgRef.current || (e.target as SVGElement).tagName === "rect") {
      isDragging.current = true;
      dragStart.current = { x: e.clientX - transform.x, y: e.clientY - transform.y };
    }
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (isDragging.current) {
      setTransform((prev) => ({
        ...prev,
        x: e.clientX - dragStart.current.x,
        y: e.clientY - dragStart.current.y,
      }));
    }
  };

  const handleMouseUp = () => {
    isDragging.current = false;
  };

  const resetView = () => {
    setTransform({ x: 0, y: 0, scale: 1 });
  };


  const statusColors: Record<string, string> = {
    DRAFT: "#94a3b8",
    PUBLISHED: "#3b82f6",
    ARCHIVED: "#475569",
  };

  const nodeColor = (n: GraphNode): string => {
    if (n.status === "ARCHIVED") return "#475569";
    if (!n.folderId) return "#f59e0b";
    if (n.isSubfolderNote) return "#8b5cf6";
    return "#3b82f6";
  };

  const legendItems = [
    { key: "root", label: "RootFolder", dot: "bg-blue-500" },
    { key: "sub", label: "SubFolder", dot: "bg-violet-500" },
    { key: "none", label: "NoFolder", dot: "bg-amber-500" },
    { key: "arch", label: "Archived", dot: "bg-zinc-700" },
  ];

  return (
    <div className="relative w-full h-[600px] border rounded-lg overflow-hidden bg-muted/20">
      <svg
        ref={svgRef}
        className="w-full h-full"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.scale})`}>
          {links.map((link, i) => {
            const source = nodePositions.get(link.source);
            const target = nodePositions.get(link.target);
            if (!source || !target) return null;

            return (
              <line
                key={i}
                x1={source.x}
                y1={source.y}
                x2={target.x}
                y2={target.y}
                stroke="#cbd5e1"
                strokeWidth={1.5}
                className="pointer-events-none"
              />
            );
          })}
          {nodes.map((node) => {
            const pos = nodePositions.get(node.id);
            if (!pos) return null;
            const isHovered = hoveredNode === node.id;
            return (
              <g
                key={node.id}
                transform={`translate(${pos.x}, ${pos.y})`}
                onClick={() => handleNodeClick(node.id)}
                onMouseEnter={() => setHoveredNode(node.id)}
                onMouseLeave={() => setHoveredNode(null)}
                className="cursor-pointer"
              >
                <circle
                  r={isHovered ? 12 : 8}
                  fill={nodeColor(node)}
                  stroke={isHovered ? "#1e293b" : "none"}
                  strokeWidth={isHovered ? 2 : 0}
                  className="transition-all"
                />
                <text
                  y={20}
                  textAnchor="middle"
                  className="text-xs fill-foreground pointer-events-none select-none"
                  fontSize="10"
                >
                  {node.title.length > 20
                    ? node.title.slice(0, 20) + "..."
                    : node.title}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      <div className="absolute bottom-4 right-4 flex flex-col gap-2">
        <Button
          variant="secondary"
          size="icon"
          className="h-8 w-8 shadow-md"
          onClick={() =>
            setTransform((prev) => ({
              ...prev,
              scale: Math.min(3, prev.scale * 1.2),
            }))
          }
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 5v14" />
            <path d="M5 12h14" />
          </svg>
        </Button>
        <Button
          variant="secondary"
          size="icon"
          className="h-8 w-8 shadow-md"
          onClick={() =>
            setTransform((prev) => ({
              ...prev,
              scale: Math.max(0.3, prev.scale / 1.2),
            }))
          }
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12h14" />
          </svg>
        </Button>
        <Button
          variant="secondary"
          size="icon"
          className="h-8 w-8 shadow-md"
          onClick={resetView}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
          </svg>
        </Button>
      </div>

      <div className="absolute top-4 left-4 bg-background/80 backdrop-blur-sm rounded-md p-2 text-xs space-y-1">
        {legendItems.map((item) => (
          <div key={item.key} className="flex items-center gap-2">
            <span className={"w-3 h-3 rounded-full " + item.dot} />
            <span>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
