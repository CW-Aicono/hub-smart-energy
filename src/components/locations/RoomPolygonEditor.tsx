import { useState, useRef, useCallback, useEffect } from "react";
import { FloorRoom, useFloorRooms } from "@/hooks/useFloorRooms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DoorOpen, Plus, Trash2, Pencil, Check, X, Undo2, Crosshair } from "lucide-react";
import { toast } from "sonner";
import { RoomOverlay2D } from "./RoomOverlay2D";
import { FloorPlanImage } from "./FloorPlanRenderer";
import { useTranslation } from "@/hooks/useTranslation";

interface PolygonPoint {
  x: number;
  y: number;
}

interface RoomPolygonEditorProps {
  floorId: string;
  floorPlanUrl: string;
}

export function RoomPolygonEditor({ floorId, floorPlanUrl }: RoomPolygonEditorProps) {
  const { t } = useTranslation();
  const { rooms, loading, addRoom, updateRoom, deleteRoom } = useFloorRooms(floorId);
  const imageRef = useRef<HTMLImageElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const [selectedRoom, setSelectedRoom] = useState<FloorRoom | null>(null);
  const [drawingPoints, setDrawingPoints] = useState<PolygonPoint[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawingName, setDrawingName] = useState("");
  const [editingRoom, setEditingRoom] = useState<FloorRoom | null>(null);
  const [editPoints, setEditPoints] = useState<PolygonPoint[]>([]);
  const [draggingPointIdx, setDraggingPointIdx] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [overlayStyle, setOverlayStyle] = useState<React.CSSProperties>({});
  const containerRef = useRef<HTMLDivElement>(null);

  // Calculate the actual rendered image area within the object-contain container
  const updateOverlayStyle = useCallback(() => {
    if (!imageRef.current) return;
    const img = imageRef.current;
    const container = img.parentElement;
    if (!container) return;
    
    const containerRect = container.getBoundingClientRect();
    const imgRatio = img.naturalWidth / img.naturalHeight;
    const containerRatio = containerRect.width / containerRect.height;
    
    let renderWidth: number, renderHeight: number, offsetX: number, offsetY: number;
    
    if (imgRatio > containerRatio) {
      renderWidth = containerRect.width;
      renderHeight = containerRect.width / imgRatio;
      offsetX = 0;
      offsetY = (containerRect.height - renderHeight) / 2;
    } else {
      renderHeight = containerRect.height;
      renderWidth = containerRect.height * imgRatio;
      offsetX = (containerRect.width - renderWidth) / 2;
      offsetY = 0;
    }
    
    setOverlayStyle({
      position: 'absolute',
      left: `${offsetX}px`,
      top: `${offsetY}px`,
      width: `${renderWidth}px`,
      height: `${renderHeight}px`,
    });
  }, []);

  useEffect(() => {
    if (imgLoaded) updateOverlayStyle();
    window.addEventListener('resize', updateOverlayStyle);
    return () => window.removeEventListener('resize', updateOverlayStyle);
  }, [imgLoaded, updateOverlayStyle]);

  const calcPos = useCallback((e: React.MouseEvent) => {
    if (!overlayRef.current) return null;
    const rect = overlayRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    if (x < 0 || x > 100 || y < 0 || y > 100) return null;
    return { x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) };
  }, []);

  // Start drawing a new room
  const startDrawing = () => {
    setIsDrawing(true);
    setDrawingPoints([]);
    setDrawingName("");
    setSelectedRoom(null);
    setEditingRoom(null);
  };

  const cancelDrawing = () => {
    setIsDrawing(false);
    setDrawingPoints([]);
    setDrawingName("");
    setPlacingRoom(null);
  };

  // State for placing an existing room
  const [placingRoom, setPlacingRoom] = useState<FloorRoom | null>(null);

  const startPlacingRoom = (room: FloorRoom) => {
    setPlacingRoom(room);
    setIsDrawing(true);
    setDrawingPoints([]);
    setDrawingName(room.name);
    setSelectedRoom(null);
    setEditingRoom(null);
  };

  // Click on the floor plan to add polygon point
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (editingRoom && draggingPointIdx === null) {
      return;
    }
    if (!isDrawing) return;
    const pos = calcPos(e);
    if (pos) setDrawingPoints((prev) => [...prev, pos]);
  };

  const undoLastPoint = () => {
    setDrawingPoints((prev) => prev.slice(0, -1));
  };

  // Save new polygon room or place existing room
  const handleSaveDrawing = async () => {
    if (drawingPoints.length < 3) return;
    setSaving(true);

    if (placingRoom) {
      // Placing an existing room
      const { error } = await updateRoom(placingRoom.id, {
        polygon_points: drawingPoints,
      } as any);
      setSaving(false);
      if (error) {
        toast.error(t("room.errorPlace"));
      } else {
        toast.success(`"${placingRoom.name}" ${t("room.placed")}`);
        cancelDrawing();
      }
    } else {
      // Creating a new room
      if (!drawingName.trim()) return;
      const { error } = await addRoom({
        floor_id: floorId,
        name: drawingName.trim(),
        position_x: 0,
        position_y: 0,
        width: 4,
        depth: 4,
        wall_height: 2.8,
        color: ROOM_COLORS[rooms.length % ROOM_COLORS.length],
        polygon_points: drawingPoints,
      } as any);
      setSaving(false);
      if (error) {
        toast.error(t("room.errorCreate"));
      } else {
        toast.success(`"${drawingName.trim()}" ${t("room.created")}`);
        cancelDrawing();
      }
    }
  };

  // Edit existing room polygon
  const startEditRoom = (room: FloorRoom) => {
    setEditingRoom(room);
    setEditPoints(
      room.polygon_points && Array.isArray(room.polygon_points)
        ? (room.polygon_points as PolygonPoint[])
        : []
    );
    setIsDrawing(false);
    setSelectedRoom(null);
  };

  const cancelEdit = () => {
    setEditingRoom(null);
    setEditPoints([]);
    setDraggingPointIdx(null);
  };

  const saveEditRoom = async () => {
    if (!editingRoom || editPoints.length < 3) return;
    setSaving(true);
    const { error } = await updateRoom(editingRoom.id, {
      polygon_points: editPoints,
      color: editingRoom.color,
      name: editingRoom.name,
    } as any);
    setSaving(false);
    if (error) {
      toast.error(t("room.errorSave"));
    } else {
      toast.success(t("room.updated"));
      cancelEdit();
    }
  };

  // Drag point handlers for editing
  const handlePointMouseDown = (idx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setDraggingPointIdx(idx);
  };

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (draggingPointIdx === null || !editingRoom) return;
      const pos = calcPos(e);
      if (pos) {
        setEditPoints((prev) => prev.map((p, i) => (i === draggingPointIdx ? pos : p)));
      }
    },
    [draggingPointIdx, editingRoom, calcPos]
  );

  const handleMouseUp = () => {
    setDraggingPointIdx(null);
  };

  const handleDeleteRoom = async (room: FloorRoom) => {
    const { error } = await deleteRoom(room.id);
    if (error) {
      toast.error(t("room.errorDelete"));
    } else {
      toast.success(`"${room.name}" ${t("room.deleted")}`);
      if (selectedRoom?.id === room.id) setSelectedRoom(null);
      if (editingRoom?.id === room.id) cancelEdit();
    }
  };


  const activePoints = editingRoom ? editPoints : isDrawing ? drawingPoints : [];
  const activeColor = editingRoom?.color || ROOM_COLORS[rooms.length % ROOM_COLORS.length];

  return (
    <div className="flex gap-4 h-full">
      {/* Room list sidebar */}
      <div className="w-56 flex-shrink-0 border rounded-lg bg-muted/30 flex flex-col h-full">
        <div className="p-3 border-b bg-muted/50 flex-shrink-0">
          <h3 className="font-medium text-sm">{t("room.listHeader")}</h3>
          <p className="text-xs text-muted-foreground mt-1">{rooms.length} {t("room.listHeader")}</p>
        </div>
        <ScrollArea className="flex-1 min-h-0">
          <div className="p-2 space-y-1">
            {loading ? (
              <p className="text-sm text-muted-foreground text-center py-8">{t("room.loading")}</p>
            ) : rooms.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                {t("room.empty")}
              </p>
            ) : (
              rooms.map((room) => {
                const hasPolygon = room.polygon_points && Array.isArray(room.polygon_points) && (room.polygon_points as PolygonPoint[]).length >= 3;
                return (
                  <div
                    key={room.id}
                    className={`flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors group ${
                      selectedRoom?.id === room.id || editingRoom?.id === room.id
                        ? "bg-primary/10 border border-primary"
                        : "hover:bg-muted border border-transparent"
                    }`}
                    onClick={() => {
                      if (!isDrawing && !editingRoom) setSelectedRoom(room);
                    }}
                  >
                    <div
                      className="w-3 h-3 rounded-full border flex-shrink-0"
                      style={{ backgroundColor: room.color || "#3b82f6" }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{room.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {hasPolygon ? "Platziert" : "Nicht platziert"}
                      </p>
                    </div>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      {!hasPolygon && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-primary hover:text-primary"
                          onClick={(e) => {
                            e.stopPropagation();
                            startPlacingRoom(room);
                          }}
                          title="Im Grundriss platzieren"
                        >
                          <Crosshair className="h-3 w-3" />
                        </Button>
                      )}
                      {hasPolygon && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={(e) => {
                            e.stopPropagation();
                            startEditRoom(room);
                          }}
                          title="Polygon bearbeiten"
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-destructive hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteRoom(room);
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>
        <div className="p-2 border-t flex-shrink-0">
          {isDrawing ? (
            <div className="space-y-2">
              {placingRoom ? (
                <p className="text-xs font-medium">„{placingRoom.name}" platzieren</p>
              ) : (
                <Input
                  value={drawingName}
                  onChange={(e) => setDrawingName(e.target.value)}
                  placeholder="Raumname"
                  className="h-8 text-sm"
                  autoFocus
                />
              )}
              <p className="text-xs text-muted-foreground">
                {drawingPoints.length} Punkte – Klicken Sie auf den Grundriss
              </p>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  className="flex-1 h-7 text-xs"
                  onClick={handleSaveDrawing}
                  disabled={drawingPoints.length < 3 || (!placingRoom && !drawingName.trim()) || saving}
                >
                  <Check className="h-3 w-3 mr-1" />
                  {t("common.save")}
                </Button>
                <Button size="sm" variant="ghost" className="h-7" onClick={undoLastPoint} disabled={drawingPoints.length === 0}>
                  <Undo2 className="h-3 w-3" />
                </Button>
                <Button size="sm" variant="ghost" className="h-7" onClick={cancelDrawing}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ) : editingRoom ? (
            <div className="space-y-2">
              <p className="text-xs font-medium">{editingRoom.name} {t("room.editSuffix")}</p>
              <p className="text-xs text-muted-foreground">
                {t("room.dragHint")}
              </p>
              <div className="flex items-center gap-2">
                <label className="text-xs text-muted-foreground shrink-0">Name:</label>
                <Input
                  value={editingRoom.name}
                  onChange={(e) => setEditingRoom({ ...editingRoom, name: e.target.value })}
                  className="h-7 text-xs"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-muted-foreground">Farbe:</label>
                <div className="flex gap-1 flex-wrap">
                  {ROOM_COLORS.map((c) => (
                    <button
                      key={c}
                      className={`w-5 h-5 rounded-full border-2 transition-transform ${editingRoom.color === c ? 'border-foreground scale-110' : 'border-transparent hover:scale-110'}`}
                      style={{ backgroundColor: c }}
                      onClick={() => setEditingRoom({ ...editingRoom, color: c })}
                    />
                  ))}
                </div>
              </div>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  className="flex-1 h-7 text-xs"
                  onClick={saveEditRoom}
                  disabled={editPoints.length < 3 || saving}
                >
                  <Check className="h-3 w-3 mr-1" />
                  Speichern
                </Button>
                <Button size="sm" variant="ghost" className="h-7" onClick={cancelEdit}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ) : (
            <Button size="sm" className="w-full gap-1.5 h-8" onClick={startDrawing}>
              <Plus className="h-3.5 w-3.5" />
              Raum zeichnen
            </Button>
          )}
        </div>
      </div>

      {/* Floor plan with polygon drawing */}
      <div
        className="flex-1 relative border rounded-lg overflow-hidden bg-muted/20 min-h-0"
      >
        <FloorPlanImage
          ref={imageRef}
          src={floorPlanUrl}
          alt="Grundriss"
          className={`w-full h-full object-contain`}
          draggable={false}
          onLoad={() => { setImgLoaded(true); updateOverlayStyle(); }}
        />

        {/* Overlay that exactly matches the rendered image area */}
        <div
          ref={overlayRef}
          style={overlayStyle}
          className={`${isDrawing ? "cursor-crosshair" : ""}`}
          onClick={handleOverlayClick}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {/* Show existing rooms */}
          <RoomOverlay2D
            rooms={editingRoom ? rooms.filter((r) => r.id !== editingRoom.id) : rooms}
            selectedRoomId={selectedRoom?.id}
            onSelectRoom={(r) => {
              if (!isDrawing && !editingRoom) setSelectedRoom(r);
            }}
          />

          {/* Active polygon (drawing or editing) */}
          {activePoints.length > 0 && (
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              {activePoints.length >= 3 && (
                <polygon
                  points={activePoints.map((p) => `${p.x},${p.y}`).join(" ")}
                  fill={activeColor}
                  fillOpacity={0.25}
                  stroke={activeColor}
                  strokeWidth={0.3}
                />
              )}
              {activePoints.length >= 2 &&
                activePoints.map((p, i) => {
                  const next = activePoints[(i + 1) % activePoints.length];
                  if (i === activePoints.length - 1 && activePoints.length < 3) return null;
                  if (i === activePoints.length - 1 && isDrawing) return null;
                  return (
                    <line
                      key={i}
                      x1={p.x} y1={p.y} x2={next.x} y2={next.y}
                      stroke={activeColor} strokeWidth={0.3}
                    />
                  );
                })}
              {isDrawing &&
                activePoints.length >= 2 &&
                activePoints.slice(0, -1).map((p, i) => (
                  <line
                    key={`seg-${i}`}
                    x1={p.x} y1={p.y}
                    x2={activePoints[i + 1].x} y2={activePoints[i + 1].y}
                    stroke={activeColor} strokeWidth={0.3}
                  />
                ))}
              {activePoints.map((p, i) => (
                <circle
                  key={i}
                  cx={p.x} cy={p.y}
                  r={editingRoom ? 0.8 : 0.5}
                  fill="white"
                  stroke={activeColor}
                  strokeWidth={0.25}
                  className={editingRoom ? "pointer-events-auto cursor-grab" : ""}
                  onMouseDown={(e) => editingRoom && handlePointMouseDown(i, e as any)}
                />
              ))}
            </svg>
          )}

          {/* Drawing hint */}
          {isDrawing && drawingPoints.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="bg-card/90 backdrop-blur-sm border rounded-lg px-4 py-3 text-center">
                <DoorOpen className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm font-medium">Klicken Sie auf den Grundriss</p>
                <p className="text-xs text-muted-foreground">um die Ecken des Raums zu definieren</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const ROOM_COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#84cc16",
];
