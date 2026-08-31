import * as React from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
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
  const [showLib, setShowLib] = React.useState(true);
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
      // check if clicked on element
      const el = (target.closest("[data-el-id]") as HTMLElement|null);
      if(el){
        const id = el.getAttribute("data-el-id");
        setSelectedId(id);
        // start drag move
        const world = screenToWorld(e.clientX, e.clientY);
        const found = elements.find(x=>x.id===id);
        if(found){
          setDrawing({ type:"move", id, start: world, orig: {x:found.x, y:found.y}});
        }
        return;
      } else {
        setSelectedId(null);
      }
      return;
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
      const world = screenToWorld(e.clientX, e.clientY);
      const id = uid();
      // Inline editable text — like Excalidraw: create empty element, then open a
      // canvas-positioned textarea for multiline + Arabic typing. No window.prompt.
      const newEl = {
        id, type:"text", x:world.x, y:world.y, w: 200, h: 32,
        text: "", stroke, fill:"transparent", strokeWidth, fontSize:20,
        dir: "ltr",
      };
      pushHistory([...elements, newEl]);
      setSelectedId(id);
      setEditingTextId(id);
      setTextDraft("");
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
      setDrawing({ id, type:"pen", points: [[world.x, world.y]], stroke, strokeWidth });
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
      setDrawing((d:any)=> ({...d, points: [...d.points, [world.x, world.y]]}));
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
    if(drawing.type==="move"){
      // push history for move
      setHistory(h=> [...h.slice(-99), elements]);
      setRedoStack([]);
      setDrawing(null);
      return;
    }
    if(drawing.type==="pen"){
      if(drawing.points.length<2){ setDrawing(null); return; }
      const xs = drawing.points.map((p:number[])=>p[0]), ys=drawing.points.map((p:number[])=>p[1]);
      const minX=Math.min(...xs), minY=Math.min(...ys), maxX=Math.max(...xs), maxY=Math.max(...ys);
      const el={id:drawing.id, type:"pen", x:minX, y:minY, w:maxX-minX, h:maxY-minY, points: drawing.points.map((p:number[])=>[p[0]-minX, p[1]-minY]), stroke: drawing.stroke, strokeWidth: drawing.strokeWidth};
      pushHistory([...elements, el]);
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

  // # reference search
  const { data: searchData } = useQuery({
    queryKey: ["storm-search", searchHash],
    queryFn: async()=>{
      if(!searchHash) return {storms:[]};
      const r=await api.get<{storms:Storm[]}>(`/api/storms/search?q=${encodeURIComponent(searchHash)}`);
      return r as any;
    },
    enabled: !!searchHash,
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

  const [renameOpen, setRenameOpen] = React.useState(false);
  const [renameVal, setRenameVal] = React.useState("");

  React.useEffect(()=>{ if(stormData?.name) setRenameVal(stormData.name); },[stormData?.name]);

  // Keyboard shortcuts: standard whiteboard UX.
  // 1=select, 2=hand, 3=pen, 4=rect, 5=ellipse, 6=diamond, 7=arrow, 8=line, 9=text, 0=eraser
  // V=select, H=hand, P=pen, R=rect, O=ellipse, D=diamond, A=arrow, L=line, T=text, E=eraser
  // Ctrl/Cmd+Z=undo, Ctrl/Cmd+Shift+Z / Ctrl+Y=redo, Ctrl/Cmd+D=duplicate, Delete/Backspace=delete
  // Hold Space = pan from any tool. Esc = release current action.
  const [spaceHeld, setSpaceHeld] = React.useState(false);
  React.useEffect(()=>{
    const isFormFocus = () => {
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
      const keyMap: Record<string, any> = { "1":"select","v":"select","2":"hand","h":"hand","3":"pen","p":"pen","4":"rect","r":"rect","5":"ellipse","o":"ellipse","6":"diamond","d":"diamond","7":"arrow","a":"arrow","8":"line","l":"line","9":"text","t":"text","0":"eraser","e":"eraser" };
      const next = keyMap[e.key.toLowerCase()];
      if(next){ setTool(next); }
    };
    const onKeyUp = (e: KeyboardEvent) => { if(e.code === "Space") setSpaceHeld(false); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("keyup", onKeyUp); };
  }, [selectedId, editingTextId, spaceHeld, undo, redo, duplicateSelected, deleteSelected]);

  // while editing a text element, hide the rendered text under the editor
  const renderElement = (el:any, hideIfEditing = false)=>{
    const isSelected = el.id===selectedId;
    const isEditing = editingTextId===el.id;
    if(hideIfEditing && isEditing) return null;
    const selStroke = isSelected ? "hsl(var(--primary))" : undefined;
    if(el.type==="pen"){
      const d = el.points.map((p:number[],i:number)=> `${i===0?"M":"L"} ${p[0]} ${p[1]}`).join(" ");
      return (
        <g key={el.id} data-el-id={el.id} className="cursor-pointer">
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
      // detect # references: #(name) or #name
      const parts = String(el.text).split(/(#\([^\)]+\))/g);
      return (
        <g key={el.id} data-el-id={el.id} transform={`translate(${el.x},${el.y})`}>
          <foreignObject width={Math.max(160, el.w)} height={Math.max(40, el.h)} >
            <div
              dir={el.dir||"auto"}
              style={{
                fontFamily: "'Caveat','Kalam','Segoe UI',system-ui",
                fontSize: el.fontSize||20,
                lineHeight: 1.2,
                color: el.stroke,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                cursor: editingTextId===el.id ? "text" : "pointer",
                padding: 4,
                minWidth: 80,
              }}
              onMouseDown={(e)=> e.stopPropagation()}
              onClick={(e)=>{
                e.stopPropagation();
                // Single-click on a text element: select AND immediately enter edit mode (one click to start typing).
                setSelectedId(el.id);
                setEditingTextId(el.id);
                setTextDraft(el.text || "");
              }}
              onDoubleClick={(e)=>{
                e.stopPropagation();
                // Double-click also opens the editor (idempotent).
                setEditingTextId(el.id);
                setTextDraft(el.text || "");
              }}
            >
              {parts.map((p,i)=>{
                if(p.startsWith("#(") && p.endsWith(")")){
                  const name=p.slice(2,-1);
                  return <span key={i} onClick={(e)=>{ e.stopPropagation(); const found=(searchData as any)?.storms?.find((s:Storm)=> s.name===name) || elements.find(x=> x.text===name); if(found?.id) navigate(`/storms/${found.id}`); else alert(`Storm "${name}" not found — create it in Storms graph.`); }} style={{color:"hsl(var(--primary))", textDecoration:"underline", cursor:"pointer", fontWeight:700}}>#{name}</span>;
                }
                return <span key={i}>{p}</span>;
              })}
            </div>
          </foreignObject>
          {isSelected && <rect x={-2} y={-2} width={Math.max(160, el.w)+4} height={Math.max(40, el.h)+4} fill="none" stroke={selStroke} strokeDasharray="6 6"/>}
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
    <g opacity={0.7}>
      {drawing.type==="pen" ? (
        <path d={drawing.points.map((p:number[],i:number)=> `${i===0?"M":"L"} ${p[0]- (drawing.points[0][0]-drawing.id.length)} ${p[1]}`).join(" ")} fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round"/>
      ) : ["rect","ellipse","diamond"].includes(drawing.type) ? (
        <rect x={drawing.x} y={drawing.y} width={drawing.w} height={drawing.h} rx={8} fill={fill==="transparent"?"none":fill} stroke={stroke} strokeWidth={strokeWidth} strokeDasharray="6 4"/>
      ) : (drawing.type==="arrow"||drawing.type==="line") ? (
        <path d={`M ${drawing.x} ${drawing.y} L ${drawing.x2} ${drawing.y2}`} fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeDasharray="6 4" markerEnd={drawing.type==="arrow"?"url(#arrowhead)":undefined}/>
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
        {/* libraries */}
        {showLib && (
          <div className="w-56 border-r bg-surface p-3 space-y-3 overflow-auto hidden lg:block">
            <div className="flex items-center justify-between"><h4 className="font-mono text-xs uppercase tracking-wider">Libraries</h4><Button variant="ghost" size="sm" className="h-6" onClick={()=> setShowLib(false)}>×</Button></div>
            <div>
              <p className="text-xs font-medium mb-2">Basic</p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  {type:"rect", label:"▭"},
                  {type:"ellipse", label:"○"},
                  {type:"diamond", label:"◇"},
                  {type:"arrow", label:"→"},
                  {type:"line", label:"—"},
                  {type:"text", label:"T"},
                ].map(it=> (
                  <button key={it.type} onClick={()=> setTool(it.type as any)} className={`h-10 border-2 rounded-lg flex items-center justify-center text-sm font-mono ${tool===it.type ? "border-primary bg-primary/10":"border-outline hover:border-primary"}`}>{it.label}</button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-medium mb-1">Hand-drawn tips</p>
              <p className="text-xs text-muted-foreground">All strokes are sketchy. Zoom/pan infinite canvas, drag images anywhere, resize via selection. Type #(Storm Name) to reference another storm — click to open it.</p>
            </div>
            <div>
              <p className="text-xs font-medium mb-1">Images</p>
              <Button size="sm" className="w-full" onClick={()=> fileInputRef.current?.click()}>Add image</Button>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
            </div>
          </div>
        )}

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
                {k:"select", l:"Select (V / 1)", i:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 3 7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/><path d="m13 13 6 6"/></svg>},
                {k:"hand", l:"Hand (H / 2)", i:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 11V6a2 2 0 0 0-4 0v5"/><path d="M14 10V4a2 2 0 0 0-4 0v6"/><path d="M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 0 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>},
                {k:"pen", l:"Pen (P / 3)", i:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></svg>},
                {k:"rect", l:"Rectangle (R / 4)", i:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="14" x="3" y="5" rx="2"/></svg>},
                {k:"ellipse", l:"Ellipse (O / 5)", i:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="12" rx="10" ry="7"/></svg>},
                {k:"diamond", l:"Diamond (D / 6)", i:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2 22 12 12 22 2 12z"/></svg>},
                {k:"arrow", l:"Arrow (A / 7)", i:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>},
                {k:"line", l:"Line (L / 8)", i:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 19 19 5"/></svg>},
                {k:"text", l:"Text (T / 9)", i:<span className="text-base font-bold">T</span>},
                {k:"image", l:"Image", i:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>},
                {k:"eraser", l:"Eraser (E / 0)", i:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/></svg>},
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
                    {c:"#ffffff"},
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
              <div className="flex items-center gap-1 text-xs">
                <input placeholder="#(Storm Name) to reference…" value={searchHash} onChange={e=> setSearchHash(e.target.value)} dir="auto" className="flex-1 h-7 px-2 border rounded text-xs" />
                {searchHash && (searchData as any)?.storms?.length>0 && (
                  <div className="absolute mt-7 right-3 bg-white dark:bg-zinc-900 border rounded shadow-lg p-1 z-10 w-56">
                    {(searchData as any).storms.map((s:Storm)=> (
                      <button key={s.id} onClick={()=> { navigator.clipboard.writeText(`#(${s.name})`); alert(`Copied #(${s.name}) — paste into text`); setSearchHash(""); }} className="block w-full text-left px-2 py-1 hover:bg-accent rounded text-xs">{s.name}</button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Floating zoom controls — bottom-left */}
            <div
              className="absolute bottom-3 left-3 z-20 flex items-center gap-1 bg-white/90 dark:bg-zinc-900/90 backdrop-blur border-2 border-outline rounded-lg p-1 shadow-lg"
              onMouseDown={(e)=> e.stopPropagation()}
            >
              <button onClick={()=> setScale(s=> Math.max(0.2,s-0.1))} title="Zoom out" className="h-8 w-8 rounded-md flex items-center justify-center hover:bg-accent text-lg">−</button>
              <button onClick={()=> { setPan({x:80,y:80}); setScale(1); }} title="Reset zoom" className="h-8 px-2 rounded-md flex items-center justify-center hover:bg-accent text-xs font-mono">{Math.round(scale*100)}%</button>
              <button onClick={()=> setScale(s=> Math.min(3,s+0.1))} title="Zoom in" className="h-8 w-8 rounded-md flex items-center justify-center hover:bg-accent text-lg">+</button>
            </div>

            {/* Floating canvas actions — bottom-right */}
            <div
              className="absolute bottom-3 right-3 z-20 flex items-center gap-1 bg-white/90 dark:bg-zinc-900/90 backdrop-blur border-2 border-outline rounded-lg p-1 shadow-lg text-xs"
              onMouseDown={(e)=> e.stopPropagation()}
            >
              <button onClick={exportPNG} className="h-8 px-2 rounded-md flex items-center gap-1 hover:bg-accent"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M5 8a2 2 0 0 1 2-2h6.5L20 12.5V18a2 2 0 0 1-2 2h-7"/><path d="M9 18h6"/><path d="M9 21h6"/></svg> PNG</button>
              <button onClick={exportSVG} className="h-8 px-2 rounded-md flex items-center gap-1 hover:bg-accent"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M5 8a2 2 0 0 1 2-2h6.5L20 12.5V18a2 2 0 0 1-2 2h-7"/><path d="M9 18h6"/><path d="M9 21h6"/></svg> SVG</button>
              <span className="text-muted-foreground font-mono px-1">{elements.length} els</span>
            </div>
          </div>

      {/* Inline text editor — overlaid on canvas at element position, scaled with pan/zoom */}
      {editingTextId && (() => {
        const el = elements.find((e:any)=>e.id===editingTextId);
        if(!el) return null;
        const fontSize = (el.fontSize||20) * scale;
        const left = el.x * scale + pan.x;
        const top = el.y * scale + pan.y;
        const baseW = Math.max(180, el.w);
        // Auto-fit width to the longest line in the current draft, capped at 720px world units.
        const lines = (textDraft || "").split(/\r?\n/);
        const longest = lines.reduce((m, ln) => Math.max(m, ln.length), 0);
        const charW = (el.fontSize || 20) * 0.6;
        const fitW = Math.min(720, Math.max(baseW, Math.ceil(longest * charW) + 24));
        const w = fitW * scale;
        return (
          <textarea
            // Capture-phase mouseDown so the canvas mousedown handler can't steal
            // focus or finish the edit while the user is typing.
            onMouseDown={(e)=>{ e.stopPropagation(); }}
            onClick={(e)=>{ e.stopPropagation(); }}
            onFocus={(e)=>{ /* make sure the caret is visible */ requestAnimationFrame(()=>{ e.target.select(); }); }}
            ref={(node)=>{ if(node){ node.focus(); node.setSelectionRange(node.value.length, node.value.length); } }}
            value={textDraft}
            onChange={(e)=>{
              const v = e.target.value;
              setTextDraft(v);
              const isRtl = /[\u0600-\u06FF]/.test(v);
              // auto-grow height
              e.target.style.height = "auto";
              e.target.style.height = e.target.scrollHeight + "px";
              setElements((prev:any[])=> prev.map((x:any)=> x.id===editingTextId ? {...x, text: v, dir: isRtl?"rtl":"ltr"}:x));
            }}
            onBlur={()=>{
              setElements((prev:any[])=> prev.map((x:any)=> x.id===editingTextId ? {...x, text: textDraft, dir: /[\u0600-\u06FF]/.test(textDraft)?"rtl":"ltr"}:x));
              setEditingTextId(null);
              setTextDraft("");
            }}
            onKeyDown={(e)=>{
              if(e.key === "Escape"){
                e.preventDefault();
                setEditingTextId(null);
                setTextDraft("");
              } else if(e.key === "Enter" && (e.metaKey || e.ctrlKey)){
                e.preventDefault();
                (e.target as HTMLTextAreaElement).blur();
              }
            }}
            placeholder="Type here — Enter for new line, Esc to finish…"
            dir="auto"
            className="absolute bg-white text-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 outline-none resize-none overflow-hidden border-2 border-primary rounded p-1 z-30 shadow-xl"
            style={{
              left, top, width: w, minHeight: fontSize*1.4+8,
              fontFamily: "'Caveat','Kalam','Segoe UI',system-ui",
              fontSize,
              lineHeight: 1.2,
              color: el.stroke,
            }}
          />
        );
      })()}

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
