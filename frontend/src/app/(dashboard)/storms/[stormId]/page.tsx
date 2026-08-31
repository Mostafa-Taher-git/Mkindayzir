import * as React from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useWorkspace } from "@/hooks/use-workspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Storm = { id: string; name: string };
type WhiteboardData = { elements: any[]; appState?: any; files?: any };

const STORAGE_KEY = "storm-whiteboard-";

function uid() { return Math.random().toString(36).slice(2, 9); }

// Decide grid/text default color based on background luminance so the canvas
// remains readable on white, paper, dark, or any custom bg.
function isLightBg(hex: string) {
  if (!hex || !hex.startsWith("#")) return true;
  const h = hex.length === 4
    ? "#" + hex.slice(1).split("").map((c: string) => c + c).join("")
    : hex;
  const r = parseInt(h.slice(1, 3), 16) || 255;
  const g = parseInt(h.slice(3, 5), 16) || 255;
  const b = parseInt(h.slice(5, 7), 16) || 255;
  // perceptual luminance
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6;
}

function sketchyPath(x1:number,y1:number,x2:number,y2:number){
  const dx=x2-x1, dy=y2-y1, dist=Math.hypot(dx,dy);
  const off = Math.min(6, dist*0.04);
  const mx=(x1+x2)/2, my=(y1+y2)/2;
  const nx = -dy/dist, ny = dx/dist;
  const jx = (Math.random()-0.5)*off*0.5, jy=(Math.random()-0.5)*off*0.5;
  return `M ${x1} ${y1} Q ${mx+nx*off+jx} ${my+ny*off+jy} ${x2} ${y2}`;
}

export default function StormWhiteboardPage(){
  const { stormId } = useParams() as { stormId: string };
  const navigate = useNavigate();
  const qc = useQueryClient();
  const workspace = useWorkspace();
  const wsParam = workspace.type === "org" ? (workspace as any).orgId : "personal";
  const [tool, setTool] = React.useState<"select"|"hand"|"pen"|"rect"|"ellipse"|"diamond"|"arrow"|"line"|"text"|"image"|"eraser">("select");
  const [stroke, setStroke] = React.useState("#111827");
  const [fill, setFill] = React.useState("transparent");
  const [strokeWidth, setStrokeWidth] = React.useState(2);
  const [elements, setElements] = React.useState<any[]>([]);
  const [selectedId, setSelectedId] = React.useState<string|null>(null);
  const [history, setHistory] = React.useState<any[][]>([]);
  const [redoStack, setRedoStack] = React.useState<any[][]>([]);
  const [pan, setPan] = React.useState({x:0,y:0});
  const [scale, setScale] = React.useState(1);
  const [isPanning, setIsPanning] = React.useState(false);
  const [panStart, setPanStart] = React.useState({x:0,y:0,panX:0,panY:0});
  const [drawing, setDrawing] = React.useState<any|null>(null);
  const [editingTextId, setEditingTextId] = React.useState<string|null>(null);
  const [textDraft, setTextDraft] = React.useState("");
  const [searchHash, setSearchHash] = React.useState("");
  const [bgColor, setBgColor] = React.useState<string>("#fffef8");
  const svgRef = React.useRef<SVGSVGElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [hasLoaded, setHasLoaded] = React.useState(false);

  const { data: stormData } = useQuery({
    queryKey: ["storm", stormId],
    queryFn: async () => {
      const r = await api.get<{ storm: Storm }>(`/api/storms/${stormId}?includeWhiteboard=true`);
      return (r as any).storm as Storm & { whiteboardData?: WhiteboardData };
    },
    enabled: !!stormId,
  });
  const { data: wbData } = useQuery({
    queryKey: ["storm-whiteboard", stormId],
    queryFn: async () => {
      const r = await api.get<{ whiteboard: WhiteboardData }>(`/api/storms/${stormId}/whiteboard`);
      return (r as any).whiteboard as WhiteboardData;
    },
    enabled: !!stormId,
  });

  React.useEffect(()=>{
    if(wbData && !hasLoaded){
      setElements(wbData.elements || []);
      if(wbData.appState?.background) setBgColor(wbData.appState.background);
      setHasLoaded(true);
      const saved = localStorage.getItem(STORAGE_KEY+stormId);
      if(saved){
        try{ const p=JSON.parse(saved); if(p.elements) setElements(p.elements); if(p.appState?.background) setBgColor(p.appState.background);}catch{}
      }
    }
  },[wbData, hasLoaded, stormId]);

  // autosave
  React.useEffect(()=>{
    if(!hasLoaded) return;
    const t=setTimeout(async()=>{
      const payload={elements, appState:{pan, scale, background: bgColor}, files:{}};
      localStorage.setItem(STORAGE_KEY+stormId, JSON.stringify(payload));
      try{ await api.put(`/api/storms/${stormId}/whiteboard`, payload);}catch{}
    }, 800);
    return ()=>clearTimeout(t);
  },[elements, pan, scale, bgColor, hasLoaded, stormId]);

  const pushHistory = (next: any[])=>{
    setHistory(h=> [...h.slice(-99), elements]);
    setRedoStack([]);
    setElements(next);
  };
  const undo = ()=>{
    if(history.length===0) return;
    const prev = history[history.length-1];
    setRedoStack(r=> [...r, elements]);
    setHistory(h=> h.slice(0,-1));
    setElements(prev);
  };
  const redo = ()=>{
    if(redoStack.length===0) return;
    const nxt = redoStack[redoStack.length-1];
    setHistory(h=> [...h, elements]);
    setRedoStack(r=> r.slice(0,-1));
    setElements(nxt);
  };

  const screenToWorld = (sx:number, sy:number)=>{
    const rect = containerRef.current?.getBoundingClientRect();
    if(!rect) return {x:sx, y:sy};
    return { x: (sx - rect.left - pan.x)/scale, y: (sy - rect.top - pan.y)/scale };
  };

  const handleSvgMouseDown = (e: React.MouseEvent)=>{
    const target = e.target as Element;
    // If user is currently editing text and clicks the textarea, do nothing (let textarea handle it).
    if(editingTextId && (target as HTMLElement).tagName === "TEXTAREA") return;
    // If user is editing text and clicks anywhere else, finish the current edit.
    if(editingTextId){
      setEditingTextId(null);
      setTextDraft("");
      // do not consume this event — let it continue to whatever tool action is below
    }
    if(tool==="hand" || e.button===1 || (e.altKey && e.button===0) || spaceHeld){
      setIsPanning(true);
      setPanStart({x:e.clientX, y:e.clientY, panX:pan.x, panY:pan.y});
      return;
    }
    if(tool==="select"){
      // Excalidraw select: click empty → deselect, click element → select,
      // drag element → move, drag empty → box-select, double-click text → edit
      const hit = (target.closest("[data-el-id]") as HTMLElement|null);
      if(hit){
        const id = hit.getAttribute("data-el-id")!;
        // If user double-clicked a text element, the <text> onDoubleClick will handle edit;
        // mousedown just selects and prepares move — don't consume double-click.
        setSelectedId(id);
        const world = screenToWorld(e.clientX, e.clientY);
        const found = elements.find(x=>x.id===id);
        if(found){
          setDrawing({ type:"move", id, start: world, orig: {x:found.x, y:found.y}});
        }
        return;
      } else {
        // Start box-selection drag (Excalidraw marquee)
        const world = screenToWorld(e.clientX, e.clientY);
        setSelectedId(null);
        setDrawing({ type:"selection", x: world.x, y: world.y, w: 0, h: 0 });
        return;
      }
    }
    if(tool==="eraser"){
      const el = (target.closest("[data-el-id]") as HTMLElement|null);
      if(el){
        const id = el.getAttribute("data-el-id");
        pushHistory(elements.filter(x=>x.id!==id));
        if(selectedId===id) setSelectedId(null);
      }
      return;
    }
    if(tool==="text"){
      // Excalidraw T: click empty → new text at click, click existing text → edit it
      const hit = (target.closest("[data-el-id]") as HTMLElement|null);
      if(hit){
        const hid = hit.getAttribute("data-el-id");
        const found:any = elements.find((x:any)=> x.id===hid && x.type==="text");
        if(found){
          setSelectedId(hid);
          setEditingTextId(hid);
          setTextDraft(found.text||"");
          return;
        }
        // Hit a non-text element while in T tool — Excalidraw ignores it (don't create)
        return;
      }
      // Empty background → create new text at world point and focus immediately
      const world = screenToWorld(e.clientX, e.clientY);
      const id = uid();
      const newEl = {
        id, type: "text",
        x: world.x, y: world.y,
        w: 120, h: 28,
        text: "",
        fontSize: 20,
        fontFamily: "'Caveat','Kalam','Segoe UI',system-ui",
        lineHeight: 1.2,
        textAlign: "left",
        fontWeight: "normal",
        fontStyle: "normal",
        color: stroke,
        backgroundColor: "transparent",
        angle: 0,
        opacity: 100,
        dir: "ltr",
      };
      // Use functional updates to avoid stale closure when rapidly creating
      setHistory(h=> [...h.slice(-99), elements]);
      setRedoStack([]);
      setElements(prev=> [...prev, newEl]);
      setSelectedId(id);
      // Defer editing focus to next tick so DOM mounts first — Excalidraw does same
      setTimeout(()=> { setEditingTextId(id); setTextDraft(""); }, 0);
      return;
    }
    if(tool==="image"){
      fileInputRef.current?.click();
      return;
    }
    // shape / pen / arrow / line
    const world = screenToWorld(e.clientX, e.clientY);
    const id = uid();
    if(tool==="pen"){
      setDrawing({ id, type:"pen", x: world.x, y: world.y, points: [[0, 0]], stroke, strokeWidth });
    } else if(tool==="rect"||tool==="ellipse"||tool==="diamond"){
      setDrawing({ id, type:tool, x:world.x, y:world.y, w:0, h:0, stroke, fill, strokeWidth });
    } else if(tool==="arrow"||tool==="line"){
      setDrawing({ id, type:tool, x:world.x, y:world.y, x2:world.x, y2:world.y, stroke, strokeWidth });
    }
  };
  const handleSvgMouseMove = (e: React.MouseEvent)=>{
    if(isPanning){
      setPan({x: panStart.panX + (e.clientX - panStart.x), y: panStart.panY + (e.clientY - panStart.y)});
      return;
    }
    if(!drawing) return;
    const world = screenToWorld(e.clientX, e.clientY);
    if(drawing.type==="selection"){
      // Excalidraw marquee: normalize so w/h positive, x/y is top-left
      const w = world.x - drawing.x;
      const h = world.y - drawing.y;
      setDrawing((d:any)=> ({...d, w: Math.abs(w), h: Math.abs(h), x: w<0? world.x : d.x, y: h<0? world.y : d.y }));
      return;
    }
    if(drawing.type==="move"){
      const found = elements.find((x:any)=>x.id===drawing.id);
      if(!found) return;
      const dx = world.x - drawing.start.x;
      const dy = world.y - drawing.start.y;
      setElements((prev:any[])=> prev.map((el:any)=> el.id===drawing.id ? {...el, x: drawing.orig.x+dx, y: drawing.orig.y+dy} : el));
      // also move points for pen/arrow
      // for pen, shift points; for arrow/line shift x,y,x2,y2
      // handled via x,y for now
      return;
    }
    if(drawing.type==="pen"){
      // points are stored as offsets relative to the click origin (drawing.x, drawing.y)
      setDrawing((d:any)=> ({...d, points: [...d.points, [world.x - d.x, world.y - d.y]]}));
      return;
    }
    if(["rect","ellipse","diamond"].includes(drawing.type)){
      const w = world.x - drawing.x;
      const h = world.y - drawing.y;
      setDrawing((d:any)=> ({...d, w: Math.abs(w), h: Math.abs(h), x: w<0? world.x : d.x, y: h<0? world.y : d.y }));
      return;
    }
    if(drawing.type==="arrow"||drawing.type==="line"){
      setDrawing((d:any)=> ({...d, x2: world.x, y2: world.y}));
      return;
    }
  };
  const handleSvgMouseUp = ()=>{
    if(isPanning){ setIsPanning(false); return; }
    if(!drawing) return;
    if(drawing.type==="selection"){
      // Select elements fully/partially inside marquee — Excalidraw behaviour
      if(drawing.w < 4 && drawing.h < 4){
        setDrawing(null);
        return;
      }
      const sx = drawing.x, sy = drawing.y, ex = drawing.x + drawing.w, ey = drawing.y + drawing.h;
      // For now single-select the first intersecting (Excalidraw selects all intersecting)
      // Collect all intersecting for future multi-select
      const hitIds = elements.filter((el:any)=>{
        const elx = el.x ?? 0, ely = el.y ?? 0, elw = el.w ?? 0, elh = el.h ?? 0;
        // text with w/h 0 still has measured bounds, but we treat as hit if point inside
        const x2 = el.type==="arrow"||el.type==="line" ? Math.max(el.x, el.x2??el.x) : elx+Math.max(elw,10);
        const y2 = el.type==="arrow"||el.type==="line" ? Math.max(el.y, el.y2??el.y) : ely+Math.max(elh,10);
        const x1 = el.type==="arrow"||el.type==="line" ? Math.min(el.x, el.x2??el.x) : elx;
        const y1 = el.type==="arrow"||el.type==="line" ? Math.min(el.y, el.y2??el.y) : ely;
        return !(x2 < sx || x1 > ex || y2 < sy || y1 > ey);
      }).map((el:any)=> el.id);
      if(hitIds.length===1) setSelectedId(hitIds[0]);
      else if(hitIds.length>1) setSelectedId(hitIds[0]); // TODO multi-select
      setDrawing(null);
      return;
    }
    if(drawing.type==="move"){
      // push history for move
      setHistory(h=> [...h.slice(-99), elements]);
      setRedoStack([]);
      setDrawing(null);
      return;
    }
    if(drawing.type==="pen"){
      if(drawing.points.length<2){ setDrawing(null); return; }
      // points are offsets from drawing.x/drawing.y → compute bounding box
      const xs = drawing.points.map((p:number[])=>p[0]), ys=drawing.points.map((p:number[])=>p[1]);
      const minDx=Math.min(...xs), minDy=Math.min(...ys), maxDx=Math.max(...xs), maxDy=Math.max(...ys);
      // shift to local 0..w / 0..h, then translate the element so all points are positive
      const localPts = drawing.points.map((p:number[])=>[p[0] - minDx, p[1] - minDy]);
      const el={
        id: drawing.id,
        type: "pen",
        x: drawing.x + minDx,
        y: drawing.y + minDy,
        w: maxDx - minDx,
        h: maxDy - minDy,
        points: localPts,
        stroke: drawing.stroke,
        strokeWidth: drawing.strokeWidth,
      };
      pushHistory([...elements, el]);
      setSelectedId(el.id);
    } else if(["rect","ellipse","diamond","arrow","line"].includes(drawing.type)){
      if(Math.abs(drawing.w||0)<4 && Math.abs((drawing.x2||drawing.x)-(drawing.x||0))<4){ setDrawing(null); return; }
      const el = {...drawing};
      // normalize
      if(el.type==="arrow"||el.type==="line"){
        // keep as is
      }
      pushHistory([...elements, el]);
      setSelectedId(el.id);
    }
    setDrawing(null);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>)=>{
    const f=e.target.files?.[0];
    if(!f) return;
    const reader=new FileReader();
    reader.onload=()=>{
      const src=reader.result as string;
      const id=uid();
      const world = {x: 200 - pan.x/scale, y: 200 - pan.y/scale};
      const el={id, type:"image", x: world.x, y: world.y, w: 240, h: 160, src, stroke, strokeWidth:1};
      pushHistory([...elements, el]);
      setSelectedId(id);
    };
    reader.readAsDataURL(f);
    e.target.value="";
  };

  const exportPNG = ()=>{
    const svg = svgRef.current;
    if(!svg) return;
    const data = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([data], {type:"image/svg+xml"});
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload=()=>{
      const canvas=document.createElement("canvas");
      canvas.width=1200; canvas.height=800;
      const ctx=canvas.getContext("2d")!;
      ctx.fillStyle = document.documentElement.classList.contains("dark") ? "#0e0e0f" : "#ffffff";
      ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.drawImage(img,0,0);
      const a=document.createElement("a");
      a.download=`${stormData?.name||"storm"}.png`;
      a.href=canvas.toDataURL("image/png");
      a.click();
      URL.revokeObjectURL(url);
    };
    img.src=url;
  };
  const exportSVG = ()=>{
    const svg = svgRef.current;
    if(!svg) return;
    const data = new XMLSerializer().serializeToString(svg);
    const blob=new Blob([data], {type:"image/svg+xml"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.download=`${stormData?.name||"storm"}.svg`;
    a.href=url; a.click(); URL.revokeObjectURL(url);
  };

  const deleteSelected = ()=>{
    if(!selectedId) return;
    pushHistory(elements.filter(e=>e.id!==selectedId));
    setSelectedId(null);
  };
  const duplicateSelected = ()=>{
    if(!selectedId) return;
    const el=elements.find(e=>e.id===selectedId);
    if(!el) return;
    const copy={...el, id:uid(), x: el.x+20, y: el.y+20};
    pushHistory([...elements, copy]);
    setSelectedId(copy.id);
  };

  // # reference search — now workspace-aware, shows all (even archived) when empty
  const { data: searchData } = useQuery({
    queryKey: ["storm-search", wsParam, searchHash],
    queryFn: async()=>{
      const r=await api.get<{storms:Storm[]}>(`/api/storms/search?q=${encodeURIComponent(searchHash)}&workspace=${wsParam}`);
      return r as any;
    },
    enabled: true,
  });

  // All storms in workspace for # pill resolution (clickable links) — include archived
  const { data: allStormsData } = useQuery({
    queryKey: ["storms", wsParam],
    queryFn: async()=>{
      const r=await api.get<{storms:Storm[]}>(`/api/storms/?workspace=${wsParam}&includeArchived=true`);
      return r as any;
    },
  });

  const updateStormMut = useMutation({
    mutationFn: async (data:any)=> {
      const r=await api.patch<{storm:Storm}>(`/api/storms/${stormId}`, data);
      return r as any;
    },
    onSuccess: ()=> qc.invalidateQueries({queryKey:["storm"]}),
  });
  const deleteStormMut = useMutation({
    mutationFn: async ()=> { await api.delete(`/api/storms/${stormId}`); },
    onSuccess: ()=> navigate("/storms"),
  });

  // Update a single text element's properties (font, color, alignment, etc).
  // W is auto-recalculated based on the new font so the visible text box stays in sync.
  const updateTextEl = (id: string, patch: any) => {
    setElements((prev: any[]) => prev.map((x: any) => {
      if(x.id !== id) return x;
      const merged = { ...x, ...patch };
      // Recompute w/h if font properties changed
      if(patch.fontSize !== undefined || patch.fontFamily !== undefined || patch.fontWeight !== undefined || patch.fontStyle !== undefined || patch.text !== undefined){
        try{
          const c = document.createElement("canvas");
          const ctx = c.getContext("2d");
          if(ctx){
            const fs = merged.fontSize || 20;
            const lh = Math.ceil(fs * (merged.lineHeight || 1.2));
            const lines = String(merged.text || "").split(/\r?\n/);
            ctx.font = `${merged.fontStyle || "normal"} ${merged.fontWeight || "normal"} ${fs}px ${merged.fontFamily || "'Caveat','Kalam','Segoe UI',system-ui"}`;
            let maxW = 0;
            for(const ln of lines){ const w = ctx.measureText(ln || " ").width; if(w > maxW) maxW = w; }
            merged.w = Math.max(40, Math.ceil(maxW) + 8);
            merged.h = Math.max(lh, lines.length * lh) + 8;
          }
        }catch{}
      }
      return merged;
    }));
  };

  // Convenience: when a text element is selected, pull its properties to the panel.
  const selectedTextEl = selectedId ? elements.find((e:any)=> e.id === selectedId && e.type === "text") : null;

  const [renameOpen, setRenameOpen] = React.useState(false);
  const [renameVal, setRenameVal] = React.useState("");

  React.useEffect(()=>{ if(stormData?.name) setRenameVal(stormData.name); },[stormData?.name]);

  // Keyboard shortcuts: only 2-key combos + system keys.
  // Kept: Ctrl/Cmd+Z=undo, Ctrl/Cmd+Shift+Z / Ctrl+Y=redo, Ctrl/Cmd+D=duplicate, Delete/Backspace=delete
  // Hold Space = pan from any tool. Esc = release current action.
  // Single-key tool switches (V,H,P,R,O,D,A,L,T,E, 1-0) removed per request — use the toolbar.
  const [spaceHeld, setSpaceHeld] = React.useState(false);
  React.useEffect(()=>{
    const isFormFocus = () => {
      if(editingTextId) return true;
      const el = document.activeElement as HTMLElement | null;
      if(!el) return false;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || (el as any).isContentEditable;
    };
    const onKey = (e: KeyboardEvent) => {
      // space held (no key combo)
      if(e.code === "Space" && !isFormFocus()){
        if(!spaceHeld) setSpaceHeld(true);
        return;
      }
      if(isFormFocus()) return;
      if(e.ctrlKey || e.metaKey){
        const k = e.key.toLowerCase();
        if(k === "z" && !e.shiftKey){ e.preventDefault(); undo(); return; }
        if((k === "z" && e.shiftKey) || k === "y"){ e.preventDefault(); redo(); return; }
        if(k === "d"){ e.preventDefault(); if(selectedId) duplicateSelected(); return; }
        return;
      }
      if(e.key === "Delete" || e.key === "Backspace"){
        if(selectedId){ e.preventDefault(); deleteSelected(); return; }
      }
      if(e.key === "Escape"){
        if(editingTextId){ setEditingTextId(null); setTextDraft(""); return; }
        if(selectedId){ setSelectedId(null); return; }
        setTool("select");
        return;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => { if(e.code === "Space") setSpaceHeld(false); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("keyup", onKeyUp); };
  }, [selectedId, editingTextId, spaceHeld, undo, redo, duplicateSelected, deleteSelected]);

  // Ensure new text's textarea gets focus immediately (Excalidraw behaviour)
  // Even if React batches setState, this guarantees the next tick focuses.
  React.useEffect(()=>{
    if(!editingTextId) return;
    const t = setTimeout(()=>{
      const ta = document.querySelector('textarea[placeholder="Type something\u2026"]') as HTMLTextAreaElement | null;
      if(ta){
        ta.focus();
        try{ const l=ta.value.length; ta.setSelectionRange(l,l);}catch{}
      }
    }, 0);
    return ()=> clearTimeout(t);
  }, [editingTextId]);

  // while editing a text element, hide the rendered text under the editor
  const renderElement = (el:any, hideIfEditing = false)=>{
    const isSelected = el.id===selectedId;
    const isEditing = editingTextId===el.id;
    if(hideIfEditing && isEditing) return null;
    const selStroke = isSelected ? "hsl(var(--primary))" : undefined;
    if(el.type==="pen"){
      const d = el.points.map((p:number[],i:number)=> `${i===0?"M":"L"} ${p[0]} ${p[1]}`).join(" ");
      return (
        <g key={el.id} data-el-id={el.id} transform={`translate(${el.x},${el.y})`} className="cursor-pointer">
          <path d={d} fill="none" stroke={el.stroke} strokeWidth={el.strokeWidth} strokeLinecap="round" strokeLinejoin="round" opacity={0.95}
            style={{filter: "url(#sketch)"}} />
          {isSelected && <rect x={-4} y={-4} width={el.w+8} height={el.h+8} fill="none" stroke={selStroke} strokeDasharray="6 6" />}
        </g>
      );
    }
    if(el.type==="rect"){
      return (
        <g key={el.id} data-el-id={el.id} transform={`translate(${el.x},${el.y})`}>
          <rect width={el.w} height={el.h} rx={8} ry={8} fill={el.fill==="transparent"?"none":el.fill} stroke={el.stroke} strokeWidth={el.strokeWidth} strokeLinecap="round"
            style={{filter: "url(#sketch)"}} />
          {isSelected && <rect x={-3} y={-3} width={el.w+6} height={el.h+6} fill="none" stroke={selStroke} strokeDasharray="6 6" rx={8}/>}
        </g>
      );
    }
    if(el.type==="ellipse"){
      return (
        <g key={el.id} data-el-id={el.id} transform={`translate(${el.x},${el.y})`}>
          <ellipse cx={el.w/2} cy={el.h/2} rx={el.w/2} ry={el.h/2} fill={el.fill==="transparent"?"none":el.fill} stroke={el.stroke} strokeWidth={el.strokeWidth}
            style={{filter: "url(#sketch)"}}/>
          {isSelected && <rect x={-3} y={-3} width={el.w+6} height={el.h+6} fill="none" stroke={selStroke} strokeDasharray="6 6" rx={12}/>}
        </g>
      );
    }
    if(el.type==="diamond"){
      const cx=el.w/2, cy=el.h/2;
      return (
        <g key={el.id} data-el-id={el.id} transform={`translate(${el.x},${el.y})`}>
          <path d={`M ${cx} 0 L ${el.w} ${cy} L ${cx} ${el.h} L 0 ${cy} Z`} fill={el.fill==="transparent"?"none":el.fill} stroke={el.stroke} strokeWidth={el.strokeWidth} strokeLinejoin="round"
            style={{filter: "url(#sketch)"}}/>
          {isSelected && <rect x={-3} y={-3} width={el.w+6} height={el.h+6} fill="none" stroke={selStroke} strokeDasharray="6 6"/>}
        </g>
      );
    }
    if(el.type==="arrow"||el.type==="line"){
      const x1= el.x, y1= el.y, x2= el.x2?? el.x+el.w, y2= el.y2?? el.y+el.h;
      return (
        <g key={el.id} data-el-id={el.id}>
          <path d={sketchyPath(x1,y1,x2,y2)} fill="none" stroke={el.stroke} strokeWidth={el.strokeWidth} strokeLinecap="round" markerEnd={el.type==="arrow"?"url(#arrowhead)":undefined}
            style={{filter: "url(#sketch)"}}/>
          {isSelected && <circle cx={x1} cy={y1} r={4} fill={selStroke} />}
          {isSelected && <circle cx={x2} cy={y2} r={4} fill={selStroke} />}
        </g>
      );
    }
    if(el.type==="text"){
      // View layer: SVG <text> element — always visible, scales with the canvas.
      // Edit layer: a separate HTML <textarea> overlay (rendered outside the SVG) is used when editing.
      const fontSize = el.fontSize || 20;
      const lineHeight = el.lineHeight || 1.2;
      const fontWeight = el.fontWeight || "normal";
      const fontStyle = el.fontStyle || "normal";
      const textAlign = el.textAlign || "left";
      const color = el.color || "#111827";
      const fontFamily = (el.fontFamily || "'Caveat','Kalam','Segoe UI',system-ui").replace(/^"|"$/g, "");
      const lines = String(el.text || "").split(/\r?\n/);
      // Measure the longest line
      const measureCanvas = typeof document !== "undefined" ? document.createElement("canvas") : null;
      let maxLineW = 0, lineH = 0;
      if(measureCanvas){
        const ctx = measureCanvas.getContext("2d");
        if(ctx){
          ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`;
          lineH = Math.ceil(fontSize * lineHeight);
          for(const ln of lines){
            const w = ctx.measureText(ln || " ").width;
            if(w > maxLineW) maxLineW = w;
          }
        }
      }
      if(!lineH){
        lineH = Math.ceil(fontSize * 1.2);
        maxLineW = Math.max(...lines.map(l => l.length * fontSize * 0.6), 0);
      }
      const padX = 4, padY = 4;
      const MIN_W = 40;
      const measuredW = (lines.length === 1 && lines[0] === "") ? MIN_W : Math.max(MIN_W, Math.ceil(maxLineW) + padX*2);
      const measuredH = Math.max(lineH, lines.length * lineH) + padY*2;
      const w = el.w && el.w > 0 ? el.w : measuredW;
      const h = el.h && el.h > 0 ? el.h : measuredH;
      const isEditing = editingTextId === el.id;
      // anchorX based on textAlign
      const anchorX = textAlign === "center" ? w/2 : textAlign === "right" ? w : padX;
      const anchorTransform = textAlign === "center" ? "middle" : textAlign === "right" ? "end" : "start";
      // detect # references for clickable pills (only when not editing)
      const parts = String(el.text || "").split(/(#\([^\)]+\))/g);
      return (
        <g
          key={el.id}
          data-el-id={el.id}
          transform={`translate(${el.x},${el.y})${el.angle ? ` rotate(${el.angle} ${w/2} ${h/2})` : ""}`}
        >
          {/* Background fill behind the text (only when set) */}
          {el.backgroundColor && el.backgroundColor !== "transparent" && (
            <rect x={0} y={0} width={w} height={h} fill={el.backgroundColor} rx={2} />
          )}
          {/* Render each line as its own <text> so multi-line is exact. */}
          {lines.map((ln, i) => {
            // Split this line for # pills
            const lineParts = ln.split(/(#\([^\)]+\))/g);
            return (
              <text
                key={i}
                x={anchorX}
                y={padY + lineH * (i + 0.8)} // approximate baseline
                fontSize={fontSize}
                fontFamily={fontFamily}
                fontWeight={fontWeight}
                fontStyle={fontStyle}
                textAnchor={anchorTransform}
                fill={color}
                style={{ userSelect: isEditing ? "none" : "text", cursor: tool==="text" ? "text" : "default" }}
                onDoubleClick={(e) => {
                  // Excalidraw: double-click text in select tool → edit
                  e.stopPropagation();
                  setSelectedId(el.id);
                  setEditingTextId(el.id);
                  setTextDraft(el.text || "");
                }}
              >
                {lineParts.map((p, j) => {
                  if(p.startsWith("#(") && p.endsWith(")")){
                    const name = p.slice(2, -1);
                    return (
                      <tspan
                        key={j}
                        onClick={(e) => {
                          e.stopPropagation();
                          const all = (allStormsData as any)?.storms as Storm[] | undefined;
                          const found = all?.find((s: Storm) => s.name === name)
                            || (searchData as any)?.storms?.find((s: Storm) => s.name === name);
                          if(found?.id) navigate(`/storms/${found.id}`);
                          else {
                            // fallback: try live search for this exact name
                            api.get<{storms:Storm[]}>(`/api/storms/search?q=${encodeURIComponent(name)}&workspace=${wsParam}`).then((r:any)=>{
                              const hit = (r.storms as Storm[])?.find(s=>s.name===name);
                              if(hit?.id) navigate(`/storms/${hit.id}`);
                              else alert(`Storm "${name}" not found — create it in Storms graph.`);
                            }).catch(()=> alert(`Storm "${name}" not found — create it in Storms graph.`));
                          }
                        }}
                        style={{ textDecoration: "underline", cursor: "pointer", fill: "#dc2626", fontWeight: 700 }}
                      >#{name}</tspan>
                    );
                  }
                  return p;
                })}
              </text>
            );
          })}
          {/* Selection box (hugs the actual measured bounds) */}
          {isSelected && !isEditing && (
            <rect
              x={-2} y={-2}
              width={w+4} height={h+4}
              fill="none"
              stroke={selStroke}
              strokeDasharray="6 6"
              pointerEvents="none"
            />
          )}
        </g>
      );
    }
    if(el.type==="image"){
      return (
        <g key={el.id} data-el-id={el.id} transform={`translate(${el.x},${el.y})`}>
          <image href={el.src} width={el.w} height={el.h} preserveAspectRatio="xMidYMid meet" style={{borderRadius:8}} />
          <rect width={el.w} height={el.h} fill="none" stroke={isSelected?selStroke:"rgba(0,0,0,0.15)"} strokeWidth={isSelected?2:1} rx={8}/>
        </g>
      );
    }
    return null;
  };

  const previewEl = drawing && drawing.type!=="move" ? (
    <g opacity={drawing.type==="selection" ? 1 : 0.7}>
      {drawing.type==="selection" ? (
        <rect x={drawing.x} y={drawing.y} width={drawing.w} height={drawing.h} fill="rgba(99,102,241,0.08)" stroke="hsl(var(--primary))" strokeWidth={1/scale} strokeDasharray="6 4" rx={2}/>
      ) : drawing.type==="pen" ? (
        // Preview the pen path at world coordinates, offsetting by the
        // recorded first point so the line is anchored to the click.
        (() => {
          const [ox, oy] = drawing.points[0] || [0,0];
          const d = drawing.points.map((p:number[],i:number)=> `${i===0?"M":"L"} ${p[0] - ox + drawing.x} ${p[1] - oy + drawing.y}`).join(" ");
          return <path d={d} fill="none" stroke={drawing.stroke} strokeWidth={drawing.strokeWidth} strokeLinecap="round"/>;
        })()
      ) : ["rect","ellipse","diamond"].includes(drawing.type) ? (
        <rect x={drawing.x} y={drawing.y} width={drawing.w} height={drawing.h} rx={8} fill={drawing.fill==="transparent"?"none":drawing.fill} stroke={drawing.stroke} strokeWidth={drawing.strokeWidth} strokeDasharray="6 4"/>
      ) : (drawing.type==="arrow"||drawing.type==="line") ? (
        <path d={`M ${drawing.x} ${drawing.y} L ${drawing.x2} ${drawing.y2}`} fill="none" stroke={drawing.stroke} strokeWidth={drawing.strokeWidth} strokeLinecap="round" strokeDasharray="6 4" markerEnd={drawing.type==="arrow"?"url(#arrowhead)":undefined}/>
      ) : null}
    </g>
  ) : null;

  return (
    <div className="flex flex-col h-[calc(100vh-0px)] bg-white dark:bg-zinc-950">
      <div className="flex items-center justify-between px-3 py-2 border-b bg-surface gap-2">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={()=> navigate("/storms")}>← Back to Storms</Button>
          <div className="h-6 w-px bg-border" />
          <span className="font-bold font-mono truncate max-w-[220px]" dir="auto">{stormData?.name || "Storm"}</span>
          <Button variant="ghost" size="sm" onClick={()=> setRenameOpen(true)}>Rename</Button>
          <span className="hidden md:inline text-xs text-muted-foreground">Storm = board</span>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={undo} disabled={history.length===0}>Undo</Button>
          <Button variant="ghost" size="sm" onClick={redo} disabled={redoStack.length===0}>Redo</Button>
          <div className="h-6 w-px bg-border" />
          <Button variant="outline" size="sm" onClick={exportPNG}>Export PNG</Button>
          <Button variant="outline" size="sm" onClick={exportSVG}>Export SVG</Button>
          <Button variant="ghost" size="sm" onClick={()=> updateStormMut.mutate({isArchived:true})}>Archive</Button>
          <Button variant="destructive" size="sm" onClick={()=> { if(confirm(`Delete storm "${stormData?.name}"?`)) deleteStormMut.mutate(); }}>Delete</Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* canvas */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Canvas (full area) — all tool/property/zoom UIs are floating overlays */}
          <div
            ref={containerRef}
            className="flex-1 relative overflow-hidden select-none"
            style={{ background: bgColor }}
            onMouseDown={handleSvgMouseDown}
            onMouseMove={handleSvgMouseMove}
            onMouseUp={handleSvgMouseUp}
            onMouseLeave={handleSvgMouseUp}
          >
            <svg
              ref={svgRef}
              className="absolute inset-0 w-full h-full"
              style={{ cursor: tool==="hand"||isPanning ? "grabbing" : tool==="pen" ? "crosshair" : tool==="text" ? "text" : "default" }}
            >
              <defs>
                <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
                  <polygon points="0 0, 10 3.5, 0 7" fill={stroke} />
                </marker>
                <filter id="sketch">
                  <feTurbulence baseFrequency="0.015" numOctaves="1" result="turb" />
                  <feDisplacementMap in="SourceGraphic" in2="turb" scale="0.6" />
                </filter>
              </defs>
              <g transform={`translate(${pan.x},${pan.y}) scale(${scale})`}>
                {/* grid — color computed from background so it stays visible on white/dark/paper */}
                <g opacity={0.18} stroke={isLightBg(bgColor) ? "rgba(0,0,0,0.45)" : "rgba(255,255,255,0.45)"}>
                  {Array.from({length: 80}).map((_,i)=> (
                    <g key={i}>
                      <line x1={i*80-2000} y1={-2000} x2={i*80-2000} y2={4000} strokeWidth={0.5} />
                      <line x1={-2000} y1={i*80-2000} x2={4000} y2={i*80-2000} strokeWidth={0.5} />
                    </g>
                  ))}
                </g>
                {elements.map((el:any)=> renderElement(el, true))}
                {previewEl}
              </g>
            </svg>

            {/* resize handles for selected image/rect */}
            {selectedId && (()=> {
              const el=elements.find(e=>e.id===selectedId);
              if(!el || !["rect","ellipse","diamond","image"].includes(el.type)) return null;
              return (
                <div className="absolute" style={{left: el.x*scale+pan.x, top: el.y*scale+pan.y, width: el.w*scale, height: el.h*scale, pointerEvents:"none", border: "1px dashed hsl(var(--primary))"}} />
              );
            })()}

            {/* Floating tool rail — top-left vertical (mimics the standard whiteboard UX) */}
            <div
              className="absolute top-3 left-3 z-20 flex flex-col gap-1 bg-white/90 dark:bg-zinc-900/90 backdrop-blur border-2 border-outline rounded-lg p-1 shadow-lg"
              onMouseDown={(e)=> e.stopPropagation()}
            >
              {[
                {k:"select", l:"Select", i:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 3 7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/><path d="m13 13 6 6"/></svg>},
                {k:"hand", l:"Hand", i:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 11V6a2 2 0 0 0-4 0v5"/><path d="M14 10V4a2 2 0 0 0-4 0v6"/><path d="M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 0 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>},
                {k:"pen", l:"Pen", i:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></svg>},
                {k:"rect", l:"Rectangle", i:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="14" x="3" y="5" rx="2"/></svg>},
                {k:"ellipse", l:"Ellipse", i:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="12" rx="10" ry="7"/></svg>},
                {k:"diamond", l:"Diamond", i:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2 22 12 12 22 2 12z"/></svg>},
                {k:"arrow", l:"Arrow", i:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>},
                {k:"line", l:"Line", i:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 19 19 5"/></svg>},
                {k:"text", l:"Text", i:<span className="text-base font-bold">T</span>},
                {k:"image", l:"Image", i:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>},
                {k:"eraser", l:"Eraser", i:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/></svg>},
              ].map(t=> (
                <button
                  key={t.k}
                  onClick={()=> setTool(t.k as any)}
                  title={t.l}
                  className={`h-9 w-9 rounded-md flex items-center justify-center ${tool===t.k ? "bg-primary text-primary-foreground" : "hover:bg-accent text-foreground"}`}
                >{t.i}</button>
              ))}
              <div className="h-px bg-border my-0.5" />
              <button onClick={undo} disabled={history.length===0} title="Undo (Ctrl+Z)" className="h-9 w-9 rounded-md flex items-center justify-center hover:bg-accent disabled:opacity-30"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6.7 2.8L3 13"/></svg></button>
              <button onClick={redo} disabled={redoStack.length===0} title="Redo (Ctrl+Y)" className="h-9 w-9 rounded-md flex items-center justify-center hover:bg-accent disabled:opacity-30"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6.7 2.8L21 13"/></svg></button>
              <div className="h-px bg-border my-0.5" />
              <button onClick={deleteSelected} disabled={!selectedId} title="Delete (Del)" className="h-9 w-9 rounded-md flex items-center justify-center hover:bg-accent disabled:opacity-30"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
              <button onClick={duplicateSelected} disabled={!selectedId} title="Duplicate (Ctrl+D)" className="h-9 w-9 rounded-md flex items-center justify-center hover:bg-accent disabled:opacity-30"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg></button>
            </div>

            {/* Floating properties panel — top-right */}
            <div
              className="absolute top-3 right-3 z-20 flex flex-col gap-2 bg-white/90 dark:bg-zinc-900/90 backdrop-blur border-2 border-outline rounded-lg p-2 shadow-lg min-w-[200px]"
              onMouseDown={(e)=> e.stopPropagation()}
            >
              <div className="flex items-center gap-2 text-xs">
                <span className="font-mono uppercase tracking-wider text-muted-foreground w-10">Stroke</span>
                <input type="color" value={stroke} onChange={e=> setStroke(e.target.value)} className="h-7 w-7 p-0 border rounded" />
                <input type="range" min={1} max={8} value={strokeWidth} onChange={e=> setStrokeWidth(parseInt(e.target.value))} className="flex-1" />
                <span className="font-mono w-6 text-right">{strokeWidth}</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="font-mono uppercase tracking-wider text-muted-foreground w-10">Fill</span>
                <input type="color" value={fill==="transparent"?"#ffffff":fill} onChange={e=> setFill(e.target.value)} className="h-7 w-7 p-0 border rounded" />
                <button onClick={()=> setFill("transparent")} className="flex-1 text-xs underline">none</button>
              </div>
              <div className="h-px bg-border" />
              <div className="flex items-center gap-1 text-xs">
                <span className="font-mono uppercase tracking-wider text-muted-foreground w-10">BG</span>
                <input type="color" value={bgColor} onChange={e=> setBgColor(e.target.value)} className="h-7 w-7 p-0 border rounded" />
                <div className="flex items-center gap-0.5 ml-1">
                  {[
                    {c:"#fffef8"},
                    {c:"#e5e7eb"},
                    {c:"#0e0e0f"},
                    {c:"#fde68a"},
                    {c:"#bae6fd"},
                    {c:"#fbcfe8"},
                    {c:"#bbf7d0"},
                  ].map(sw=>(
                    <button key={sw.c} onClick={()=> setBgColor(sw.c)} className="h-5 w-5 rounded border" style={{background: sw.c, borderColor: bgColor===sw.c ? "hsl(var(--primary))" : "rgba(0,0,0,0.25)"}} />
                  ))}
                </div>
              </div>

              {/* Text properties — visible when a text element is selected */}
              {selectedTextEl && (
                <>
                  <div className="h-px bg-border" />
                  <div className="text-[10px] font-mono uppercase tracking-wider text-primary">Text</div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-mono uppercase tracking-wider text-muted-foreground w-10">Font</span>
                    <select
                      className="flex-1 h-7 px-1 border rounded text-xs bg-white dark:bg-zinc-900"
                      value={selectedTextEl.fontFamily || "'Caveat','Kalam','Segoe UI',system-ui"}
                      onChange={(e) => updateTextEl(selectedTextEl.id, { fontFamily: e.target.value })}
                    >
                      <option value="'Caveat','Kalam','Segoe UI',system-ui">Caveat</option>
                      <option value="'Kalam','Caveat',system-ui">Kalam</option>
                      <option value="Inter, system-ui, sans-serif">Inter</option>
                      <option value="Georgia, 'Times New Roman', serif">Georgia</option>
                      <option value="'Courier New', monospace">Courier</option>
                      <option value="system-ui, sans-serif">System</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-mono uppercase tracking-wider text-muted-foreground w-10">Size</span>
                    <input type="range" min={10} max={64} value={selectedTextEl.fontSize || 20} onChange={(e) => updateTextEl(selectedTextEl.id, { fontSize: parseInt(e.target.value) })} className="flex-1" />
                    <span className="font-mono w-8 text-right">{selectedTextEl.fontSize || 20}</span>
                  </div>
                  <div className="flex items-center gap-1 text-xs">
                    <span className="font-mono uppercase tracking-wider text-muted-foreground w-10">Style</span>
                    <button
                      onClick={() => updateTextEl(selectedTextEl.id, { fontWeight: (selectedTextEl.fontWeight === "bold" ? "normal" : "bold") })}
                      className={`h-7 w-7 rounded border flex items-center justify-center font-bold text-sm ${selectedTextEl.fontWeight === "bold" ? "bg-primary text-primary-foreground border-primary" : "bg-white dark:bg-zinc-900 border-outline hover:border-primary"}`}
                      title="Bold"
                    >B</button>
                    <button
                      onClick={() => updateTextEl(selectedTextEl.id, { fontStyle: (selectedTextEl.fontStyle === "italic" ? "normal" : "italic") })}
                      className={`h-7 w-7 rounded border flex items-center justify-center italic text-sm ${selectedTextEl.fontStyle === "italic" ? "bg-primary text-primary-foreground border-primary" : "bg-white dark:bg-zinc-900 border-outline hover:border-primary"}`}
                      title="Italic"
                    >I</button>
                    <div className="flex-1" />
                    <button
                      onClick={() => updateTextEl(selectedTextEl.id, { textAlign: "left" })}
                      className={`h-7 w-7 rounded border flex items-center justify-center text-sm ${(selectedTextEl.textAlign || "left") === "left" ? "bg-primary text-primary-foreground border-primary" : "bg-white dark:bg-zinc-900 border-outline hover:border-primary"}`}
                      title="Align left"
                    >≡</button>
                    <button
                      onClick={() => updateTextEl(selectedTextEl.id, { textAlign: "center" })}
                      className={`h-7 w-7 rounded border flex items-center justify-center text-sm ${selectedTextEl.textAlign === "center" ? "bg-primary text-primary-foreground border-primary" : "bg-white dark:bg-zinc-900 border-outline hover:border-primary"}`}
                      title="Align center"
                    >≡</button>
                    <button
                      onClick={() => updateTextEl(selectedTextEl.id, { textAlign: "right" })}
                      className={`h-7 w-7 rounded border flex items-center justify-center text-sm ${selectedTextEl.textAlign === "right" ? "bg-primary text-primary-foreground border-primary" : "bg-white dark:bg-zinc-900 border-outline hover:border-primary"}`}
                      title="Align right"
                    >≡</button>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-mono uppercase tracking-wider text-muted-foreground w-10">Color</span>
                    <input type="color" value={selectedTextEl.color || "#111827"} onChange={(e) => updateTextEl(selectedTextEl.id, { color: e.target.value })} className="h-7 w-7 p-0 border rounded" />
                    <div className="flex items-center gap-0.5">
                      {["#111827", "#ffffff", "#dc2626", "#2563eb", "#16a34a", "#ca8a04", "#7c3aed"].map(c => (
                        <button
                          key={c}
                          onClick={() => updateTextEl(selectedTextEl.id, { color: c })}
                          className="h-5 w-5 rounded border"
                          style={{ background: c, borderColor: (selectedTextEl.color || "#111827") === c ? "hsl(var(--primary))" : "rgba(0,0,0,0.25)" }}
                          title={c}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-mono uppercase tracking-wider text-muted-foreground w-10">BG</span>
                    <input type="color" value={(selectedTextEl.backgroundColor && selectedTextEl.backgroundColor !== "transparent") ? selectedTextEl.backgroundColor : "#ffffff"} onChange={(e) => updateTextEl(selectedTextEl.id, { backgroundColor: e.target.value })} className="h-7 w-7 p-0 border rounded" />
                    <button onClick={() => updateTextEl(selectedTextEl.id, { backgroundColor: "transparent" })} className="flex-1 text-xs underline">none</button>
                  </div>
                </>
              )}

              <div className="h-px bg-border" />
              <div className="flex items-center gap-1 text-xs">
                <input placeholder="#(Storm Name) to reference…" value={searchHash} onChange={e=> setSearchHash(e.target.value)} dir="auto" className="flex-1 h-7 px-2 border rounded text-xs" />
                {(searchData as any)?.storms?.length>0 && (
                  <div className="absolute mt-7 right-3 bg-white dark:bg-zinc-900 border rounded shadow-lg p-1 z-10 w-56 max-h-56 overflow-auto">
                    {(searchData as any).storms.map((s:Storm)=> (
                      <button key={s.id} onClick={()=> { navigator.clipboard.writeText(`#(${s.name})`); alert(`Copied #(${s.name}) — paste into text`); setSearchHash(""); }} className="block w-full text-left px-2 py-1 hover:bg-accent rounded text-xs">{s.name} { (s as any).isArchived ? "· archived" : ""}</button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Floating zoom + canvas actions — stacked bottom-right */}
            <div
              className="absolute bottom-3 right-3 z-20 flex flex-col items-end gap-1.5"
              onMouseDown={(e)=> e.stopPropagation()}
            >
              {/* Zoom controls (top) */}
              <div className="flex items-center gap-1 bg-white/90 dark:bg-zinc-900/90 backdrop-blur border-2 border-outline rounded-lg p-1 shadow-lg">
                <button onClick={()=> setScale(s=> Math.max(0.2,s-0.1))} title="Zoom out" className="h-8 w-8 rounded-md flex items-center justify-center hover:bg-accent text-lg">−</button>
                <button onClick={()=> { setPan({x:80,y:80}); setScale(1); }} title="Reset zoom" className="h-8 px-2 rounded-md flex items-center justify-center hover:bg-accent text-xs font-mono">{Math.round(scale*100)}%</button>
                <button onClick={()=> setScale(s=> Math.min(3,s+0.1))} title="Zoom in" className="h-8 w-8 rounded-md flex items-center justify-center hover:bg-accent text-lg">+</button>
              </div>
              {/* Export + element count (bottom) */}
              <div className="flex items-center gap-1 bg-white/90 dark:bg-zinc-900/90 backdrop-blur border-2 border-outline rounded-lg p-1 shadow-lg text-xs">
                <button onClick={exportPNG} className="h-8 px-2 rounded-md flex items-center gap-1 hover:bg-accent"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M5 8a2 2 0 0 1 2-2h6.5L20 12.5V18a2 2 0 0 1-2 2h-7"/><path d="M9 18h6"/><path d="M9 21h6"/></svg> PNG</button>
                <button onClick={exportSVG} className="h-8 px-2 rounded-md flex items-center gap-1 hover:bg-accent"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M5 8a2 2 0 0 1 2-2h6.5L20 12.5V18a2 2 0 0 1-2 2h-7"/><path d="M9 18h6"/><path d="M9 21h6"/></svg> SVG</button>
                <span className="text-muted-foreground font-mono px-1">{elements.length} els</span>
              </div>
            </div>
            {/* HTML edit overlay — must be INSIDE containerRef so left/top align with SVG world */}
          {editingTextId && (() => {
            const el = elements.find((e:any) => e.id === editingTextId);
            if(!el || el.type !== "text") return null;
            const fontSize = (el.fontSize || 20) * scale;
            const lineHeight = el.lineHeight || 1.2;
            const measureCanvas = typeof document !== "undefined" ? document.createElement("canvas") : null;
            const fontFamily = (el.fontFamily || "'Caveat','Kalam','Segoe UI',system-ui").replace(/^"|"$/g, "");
            let maxLineW = 0, lineH = 0;
            if(measureCanvas){
              const ctx = measureCanvas.getContext("2d");
              if(ctx){
                ctx.font = `${el.fontStyle || "normal"} ${el.fontWeight || "normal"} ${(el.fontSize || 20)}px ${fontFamily}`;
                lineH = Math.ceil((el.fontSize || 20) * lineHeight);
                const lines = String(el.text || "").split(/\r?\n/);
                for(const ln of lines){ const w = ctx.measureText(ln || " ").width; if(w > maxLineW) maxLineW = w; }
              }
            }
            if(!lineH){ lineH = Math.ceil((el.fontSize || 20) * 1.2); }
            const padX = 4, padY = 4;
            const MIN_W = 120;
            const textW = maxLineW > 0 ? Math.ceil(maxLineW) + padX*2 : MIN_W;
            const lines = String(el.text || "").split(/\r?\n/).length || 1;
            const textH = lines * lineH + padY*2;
            const wPx = Math.max(MIN_W, textW) * scale;
            const hPx = Math.max(lineH, textH) * scale;
            const left = el.x * scale + pan.x;
            const top = el.y * scale + pan.y;
            return (
              <textarea
                autoFocus
                ref={(node) => {
                  if(node){
                    node.focus();
                    const len = node.value.length;
                    try { node.setSelectionRange(len, len); } catch {}
                  }
                }}
                value={el.text || ""}
                placeholder="Type something…"
                onChange={(e) => {
                  const v = e.target.value;
                  const isRtl = /[\u0600-\u06FF]/.test(v);
                  const newLines = v.split(/\r?\n/);
                  let newMaxW = 0;
                  if(measureCanvas){
                    const ctx = measureCanvas.getContext("2d");
                    if(ctx){
                      ctx.font = `${el.fontStyle || "normal"} ${el.fontWeight || "normal"} ${(el.fontSize || 20)}px ${fontFamily}`;
                      for(const ln of newLines){ const w = ctx.measureText(ln || " ").width; if(w > newMaxW) newMaxW = w; }
                    }
                  }
                  const newW = (newMaxW > 0 ? Math.ceil(newMaxW) + padX*2 : MIN_W);
                  const newH = newLines.length * lineH + padY*2;
                  setElements((prev: any[]) => prev.map((x: any) => x.id === el.id
                    ? { ...x, text: v, dir: isRtl ? "rtl" : "ltr", w: newW, h: newH }
                    : x));
                  setTextDraft(v);
                }}
                onKeyDown={(e) => {
                  if(e.key === "Escape"){
                    e.preventDefault();
                    (e.target as HTMLTextAreaElement).blur();
                  } else if(e.key === "Enter" && (e.metaKey || e.ctrlKey)){
                    e.preventDefault();
                    (e.target as HTMLTextAreaElement).blur();
                  }
                }}
                onBlur={() => {
                  const final = (el.text || "").trim();
                  if(final === ""){
                    setElements((prev: any[]) => prev.filter((x: any) => x.id !== el.id));
                  }
                  setEditingTextId(null);
                  setTextDraft("");
                }}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                dir={el.dir || "auto"}
                spellCheck={false}
                className="absolute outline-none resize-none overflow-hidden rounded p-1 z-30"
                style={{
                  left, top, width: wPx, minHeight: hPx,
                  fontFamily,
                  fontSize: `${fontSize}px`,
                  lineHeight,
                  fontWeight: el.fontWeight || "normal",
                  fontStyle: el.fontStyle || "normal",
                  textAlign: el.textAlign || "left",
                  color: el.color || "#111827",
                  background: bgColor,
                  border: "1.5px dashed hsl(var(--primary))",
                }}
              />
            );
          })()}
          </div>

      {renameOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-zinc-900 border-2 border-zinc-900 rounded-xl p-6 w-full max-w-sm space-y-4">
            <h3 className="font-bold font-mono uppercase">Rename storm</h3>
            <Input value={renameVal} onChange={e=> setRenameVal(e.target.value)} maxLength={80} dir="auto" autoFocus />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={()=> setRenameOpen(false)}>Cancel</Button>
              <Button onClick={()=> { if(renameVal.trim()){ updateStormMut.mutate({name: renameVal.trim()}); setRenameOpen(false);} }}>Save</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  </div>
    </div>
  );
}
