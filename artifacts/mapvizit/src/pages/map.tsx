import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { useLocation } from "wouter";
import { MapContainer, TileLayer, Marker, Polyline, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import Supercluster from "supercluster";
import {
  useGetMe, useListPoints, useListCategories, useGetSettings, useCreatePoint,
  useSavePoint, useUnsavePoint, useUpdatePoint,
  useAddPointContact, useDeletePointContact,
  getListPointsQueryKey, getGetMeQueryKey, getListCategoriesQueryKey, getGetSettingsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Search, Moon, Sun, LogOut, MapPin, Phone, Globe,
  X, Bookmark, BookmarkCheck, Navigation2, ChevronRight,
  ExternalLink, Settings, Shield, Crown, Pencil, Save, ImageIcon, Plus, Trash2,
  Car, Bike, Footprints, Clock, ArrowUpRight, ArrowUp, CornerUpRight, CornerUpLeft,
  RotateCcw, Milestone, Route,
} from "lucide-react";
import { SiTelegram, SiInstagram } from "react-icons/si";
import { LocationPicker } from "@/components/location-picker";
import { uploadPointImage } from "@/lib/image-utils";

// ─── Navigation helpers ──────────────────────────────────────────────────────
type NavMode = "car" | "bike" | "walk";
type NavStep = { instruction: string; distanceM: number; icon: string; location: [number,number] };
type NavRoute = { coords: [number,number][]; distanceKm: number; drivingSec: number; steps: NavStep[] };

const MOD_UZ: Record<string, string> = {
  "uturn":        "Orqaga qayting",
  "sharp right":  "O'tkir o'ngga buriling",
  "right":        "O'ngga buriling",
  "slight right": "Biroz o'ngga buriling",
  "straight":     "To'g'ri keting",
  "slight left":  "Biroz chapga buriling",
  "left":         "Chapga buriling",
  "sharp left":   "O'tkir chapga buriling",
};

function maneuverIcon(type: string, modifier?: string): string {
  if (type === "arrive") return "🏁";
  if (type === "depart") return "🟢";
  if (type === "roundabout" || type === "rotary") return "🔄";
  if (modifier === "right" || modifier === "sharp right") return "↗";
  if (modifier === "left"  || modifier === "sharp left")  return "↖";
  if (modifier === "slight right") return "↗";
  if (modifier === "slight left")  return "↖";
  if (modifier === "uturn") return "↩";
  return "⬆";
}

function translateManeuver(m: { type: string; modifier?: string }): string {
  const { type, modifier } = m;
  const mod = modifier ? (MOD_UZ[modifier] ?? modifier) : "";
  switch (type) {
    case "depart":          return "Yo'lni boshlang" + (mod ? ` — ${mod}` : "");
    case "arrive":          return "Manzilga yetib keldingiz";
    case "turn":            return mod || "Buriling";
    case "continue":        return "To'g'ri davom eting" + (mod ? ` (${mod})` : "");
    case "new name":        return "Ko'chani davom ettiring" + (mod ? ` — ${mod}` : "");
    case "merge":           return "Yo'lga qo'shiling" + (mod ? ` — ${mod}` : "");
    case "ramp":            return "Pandusga chiqing" + (mod ? ` — ${mod}` : "");
    case "fork":            return `Ajralishda ${mod || "to'g'ri"} keting`;
    case "end of road":     return `Yo'l oxirida ${mod || "to'g'ri"} buriling`;
    case "roundabout":
    case "rotary":          return "Aylanma yo'lga kiring";
    case "exit roundabout":
    case "exit rotary":     return "Aylanma yo'ldan chiqing";
    default:                return mod || "Davom eting";
  }
}

function formatTime(sec: number): string {
  // Math.round dan keyin 60 daqiqa bug'ini oldini olish uchun total minutedan hisoblash
  const totalMin = Math.round(sec / 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m || 1} daqiqa`;
  return m === 0 ? `${h} soat` : `${h} soat ${m} daqiqa`;
}

function formatDist(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

function formatDistM(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`;
}

// ─── Geometry ────────────────────────────────────────────────────────────────
function haversineDist(a: [number,number], b: [number,number]): number {
  const R = 6371000, toR = Math.PI / 180;
  const dLat = (b[0]-a[0])*toR, dLng = (b[1]-a[1])*toR;
  const x = Math.sin(dLat/2)**2 + Math.cos(a[0]*toR)*Math.cos(b[0]*toR)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1-x));
}

function ptSegDist(p: [number,number], a: [number,number], b: [number,number]): number {
  const dx=b[1]-a[1], dy=b[0]-a[0];
  if (dx===0&&dy===0) return haversineDist(p,a);
  const t = Math.max(0, Math.min(1, ((p[1]-a[1])*dx+(p[0]-a[0])*dy)/(dx*dx+dy*dy)));
  return haversineDist(p, [a[0]+t*dy, a[1]+t*dx]);
}

function distToRoute(pos: [number,number], coords: [number,number][]): number {
  let min = Infinity;
  for (let i = 0; i < coords.length-1; i++) { const d = ptSegDist(pos, coords[i], coords[i+1]); if (d<min) min=d; }
  return min;
}

// ─── Fix Leaflet default icons ──────────────────────────────────────────────
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

// ─── Icon creators ───────────────────────────────────────────────────────────
function createPointIcon(color: string, pointName = "", categoryName = "", isSelected = false) {
  const w = isSelected ? 28 : 22;
  const h = isSelected ? 40 : 32;
  const shadow = isSelected
    ? `filter:drop-shadow(0 3px 10px rgba(0,0,0,0.6))`
    : `filter:drop-shadow(0 2px 6px rgba(0,0,0,0.45))`;
  const textShadow = "text-shadow:0 1px 4px rgba(0,0,0,0.98),0 0 8px rgba(0,0,0,0.9),0 0 2px rgba(0,0,0,1)";
  const nameLabel = pointName
    ? `<div style="margin-top:2px;color:#fff;font-size:10px;font-weight:700;letter-spacing:0.01em;white-space:nowrap;${textShadow}">${pointName}</div>`
    : "";
  const catLabel = categoryName
    ? `<div style="margin-top:1px;color:#e2e8f0;font-size:9px;font-weight:500;white-space:nowrap;opacity:0.72;${textShadow}">${categoryName}</div>`
    : "";
  const labelH = (pointName ? 14 : 0) + (categoryName ? 12 : 0) + (pointName || categoryName ? 2 : 0);
  const maxLen = Math.max(pointName.length, categoryName.length);
  const minW = maxLen * 6.5 + 10;
  return L.divIcon({
    className: "",
    html: `<div style="display:flex;flex-direction:column;align-items:center;pointer-events:none">
      <svg width="${w}" height="${h}" viewBox="0 0 22 32" fill="none" xmlns="http://www.w3.org/2000/svg" style="${shadow}">
        <path d="M11 0C4.925 0 0 4.925 0 11c0 7.18 9.35 19.44 10.42 20.82a0.75 0.75 0 001.16 0C12.65 30.44 22 18.18 22 11 22 4.925 17.075 0 11 0z" fill="${color}" stroke="white" stroke-width="${isSelected ? 2 : 1.5}"/>
        <circle cx="11" cy="11" r="${isSelected ? 5 : 4}" fill="white" opacity="${isSelected ? 0.5 : 0.35}"/>
      </svg>
      ${nameLabel}${catLabel}
    </div>`,
    iconSize: [Math.max(w + 4, minW), h + labelH],
    iconAnchor: [Math.max((w + 4) / 2, minW / 2), h],
  });
}

function createClusterIcon(count: number, color = "#3b82f6") {
  const size = count < 10 ? 36 : count < 50 ? 44 : 52;
  const fs = count < 10 ? 15 : count < 100 ? 13 : 11;
  return L.divIcon({
    className: "",
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:3px solid white;box-shadow:0 2px 12px rgba(0,0,0,0.38);display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:${fs}px;font-family:inherit">${count}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function createUserLocIcon(heading: number | null = null) {
  const size = heading !== null ? 52 : 22;
  const half = size / 2;
  const arrowSvg = heading !== null ? `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="position:absolute;top:0;left:0;overflow:visible;">
      <g transform="rotate(${heading}, ${half}, ${half})">
        <!-- Accuracy halo -->
        <circle cx="${half}" cy="${half}" r="${half - 2}" fill="rgba(59,130,246,0.12)" stroke="rgba(59,130,246,0.25)" stroke-width="1"/>
        <!-- Direction cone -->
        <polygon points="${half},4 ${half-9},${half+2} ${half},${half-3} ${half+9},${half+2}"
          fill="#3b82f6" opacity="0.9"/>
      </g>
      <!-- User dot -->
      <circle cx="${half}" cy="${half}" r="7" fill="#3b82f6" stroke="white" stroke-width="2.5"/>
    </svg>` : `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${half}" cy="${half}" r="${half - 1}" fill="rgba(59,130,246,0.25)"/>
      <circle cx="${half}" cy="${half}" r="7" fill="#3b82f6" stroke="white" stroke-width="2.5"/>
    </svg>`;
  return L.divIcon({
    className: "",
    html: `<div style="position:relative;width:${size}px;height:${size}px">${arrowSvg}</div>`,
    iconSize: [size, size],
    iconAnchor: [half, half],
  });
}

// ─── Map utility components ──────────────────────────────────────────────────
function MapController({ mapRef }: { mapRef: React.MutableRefObject<L.Map | null> }) {
  const map = useMap();
  useEffect(() => { mapRef.current = map; }, [map, mapRef]);
  return null;
}

function FlyToPoint({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => { map.flyTo([lat, lng], Math.max(map.getZoom(), 15), { duration: 0.7 }); }, [lat, lng, map]);
  return null;
}

function FlyToUserOnStart() {
  const map = useMap();
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        map.flyTo([pos.coords.latitude, pos.coords.longitude], 15, { duration: 1.2 });
      },
      () => {},
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
    );
  }, [map]);
  return null;
}

function ClusterLayer({
  points,
  selectedId,
  onSelect,
  theme,
}: {
  points: any[];
  selectedId: number | null;
  onSelect: (p: any) => void;
  theme: string | undefined;
}) {
  const map = useMap();
  const [tick, setTick] = useState(0);

  useMapEvents({
    zoomend: () => setTick(t => t + 1),
    moveend: () => setTick(t => t + 1),
  });

  const supercluster = useMemo(() => {
    const sc = new Supercluster({ radius: 60, maxZoom: 17, minZoom: 1 });
    sc.load(
      points.map(p => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
        properties: { pointData: p },
      }))
    );
    return sc;
  }, [points]);

  const clusters = useMemo(() => {
    const b = map.getBounds();
    const bbox: [number, number, number, number] = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
    const zoom = Math.round(map.getZoom());
    try { return supercluster.getClusters(bbox, zoom); } catch { return []; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supercluster, tick, map]);

  return (
    <>
      {clusters.map((cluster, i) => {
        const [lng, lat] = cluster.geometry.coordinates;
        if ((cluster.properties as any).cluster) {
          const count = (cluster.properties as any).point_count as number;
          // Derive dominant color from children
          const children = supercluster.getLeaves(
            (cluster.properties as any).cluster_id,
            1
          );
          const domColor = children[0]?.properties?.pointData?.category?.color ?? "#3b82f6";
          return (
            <Marker
              key={`cl-${cluster.id ?? i}`}
              position={[lat, lng]}
              icon={createClusterIcon(count, domColor)}
              eventHandlers={{ click: () => map.flyTo([lat, lng], map.getZoom() + 2, { duration: 0.5 }) }}
            />
          );
        }
        const p = (cluster.properties as any).pointData;
        const color = p.category?.color ?? "#3b82f6";
        const isSelected = p.id === selectedId;
        return (
          <Marker
            key={`pt-${p.id}`}
            position={[p.lat, p.lng]}
            icon={createPointIcon(color, p.name, p.category?.name ?? "", isSelected)}
            zIndexOffset={isSelected ? 1000 : 0}
            eventHandlers={{ click: () => onSelect(p) }}
          />
        );
      })}
    </>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────
export default function MapPage() {
  const [, setLocation] = useLocation();
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();
  const qc = useQueryClient();
  const mapRef = useRef<L.Map | null>(null);

  const { data: user, isError } = useGetMe({ query: { queryKey: getGetMeQueryKey(), retry: false } });
  const { data: allPoints } = useListPoints({});
  const { data: categories } = useListCategories({ query: { queryKey: getListCategoriesQueryKey() } });
  const { data: settings } = useGetSettings({ query: { queryKey: getGetSettingsQueryKey(), enabled: !!user } });

  const savePoint = useSavePoint();
  const unsavePoint = useUnsavePoint();
  const updatePoint = useUpdatePoint();
  const createPoint = useCreatePoint();

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<any | null>(null);
  const [flyTo, setFlyTo] = useState<{ lat: number; lng: number } | null>(null);

  // User GPS
  const [userPos, setUserPos] = useState<[number, number] | null>(null);
  const [userHeading, setUserHeading] = useState<number | null>(null);
  const userLocMarkerRef = useRef<L.Marker | null>(null);
  const watchIdRef = useRef<number | null>(null);

  // Edit modal (sudo/admin)
  const editingPointRef = useRef<any>(null);
  const [editModal, setEditModal] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", description: "", lat: "", lng: "", categoryId: "" });
  const [editShowPicker, setEditShowPicker] = useState(false);
  const [uploadingImg, setUploadingImg] = useState(false);
  const [editContacts, setEditContacts] = useState<any[]>([]);
  const [editContactForm, setEditContactForm] = useState({ type: "phone", label: "", value: "" });
  const [addingContact, setAddingContact] = useState(false);

  // Panel swipe-to-close
  const [panelDragY, setPanelDragY] = useState(0);
  const panelDragStartY = useRef<number | null>(null);
  const panelIsDragging = useRef(false);

  const onPanelTouchStart = (e: React.TouchEvent) => {
    panelDragStartY.current = e.touches[0].clientY;
    panelIsDragging.current = true;
  };
  const onPanelTouchMove = (e: React.TouchEvent) => {
    if (!panelIsDragging.current || panelDragStartY.current === null) return;
    const dy = e.touches[0].clientY - panelDragStartY.current;
    if (dy > 0) setPanelDragY(dy);
  };
  const onPanelTouchEnd = () => {
    if (panelDragY > 80) {
      setSelectedPoint(null);
    }
    setPanelDragY(0);
    panelDragStartY.current = null;
    panelIsDragging.current = false;
  };

  // Lightbox
  const [lightboxImages, setLightboxImages] = useState<string[]>([]);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const lightboxTouchX = useRef<number | null>(null);
  const [imgScale, setImgScale] = useState(1);
  const [imgTranslate, setImgTranslate] = useState({ x: 0, y: 0 });
  const pinchStartDist = useRef<number | null>(null);
  const pinchStartScale = useRef(1);
  const panStartPos = useRef<{ x: number; y: number } | null>(null);
  const panStartTranslate = useRef({ x: 0, y: 0 });
  const lastTapTime = useRef(0);

  const resetImgTransform = () => { setImgScale(1); setImgTranslate({ x: 0, y: 0 }); };
  const openLightbox = (images: string[], idx: number) => { setLightboxImages(images); setLightboxIdx(idx); resetImgTransform(); };
  const closeLightbox = () => { setLightboxIdx(null); resetImgTransform(); };
  const lightboxPrev = () => { setLightboxIdx(i => (i !== null && i > 0 ? i - 1 : i)); resetImgTransform(); };
  const lightboxNext = () => { setLightboxIdx(i => (i !== null && i < lightboxImages.length - 1 ? i + 1 : i)); resetImgTransform(); };

  const getPinchDist = (e: React.TouchEvent) => {
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const handleImgTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      pinchStartDist.current = getPinchDist(e);
      pinchStartScale.current = imgScale;
    } else if (e.touches.length === 1) {
      const now = Date.now();
      if (now - lastTapTime.current < 280) {
        // Double-tap: toggle 1x / 2.5x
        if (imgScale > 1) { resetImgTransform(); }
        else { setImgScale(2.5); }
        lastTapTime.current = 0;
        return;
      }
      lastTapTime.current = now;
      panStartPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      panStartTranslate.current = imgTranslate;
      // Record for outer swipe handler only when not zoomed
      if (imgScale <= 1) lightboxTouchX.current = e.touches[0].clientX;
    }
  };

  const handleImgTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchStartDist.current !== null) {
      e.preventDefault();
      const newScale = Math.min(6, Math.max(1, pinchStartScale.current * (getPinchDist(e) / pinchStartDist.current)));
      setImgScale(newScale);
      if (newScale <= 1) setImgTranslate({ x: 0, y: 0 });
    } else if (e.touches.length === 1 && panStartPos.current && imgScale > 1) {
      e.preventDefault();
      setImgTranslate({
        x: panStartTranslate.current.x + e.touches[0].clientX - panStartPos.current.x,
        y: panStartTranslate.current.y + e.touches[0].clientY - panStartPos.current.y,
      });
    }
  };

  const handleImgTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length < 2) pinchStartDist.current = null;
    if (e.touches.length === 0) panStartPos.current = null;
    if (imgScale < 1.05) resetImgTransform();
  };
  const addContactMutation = useAddPointContact();
  const deleteContactMutation = useDeletePointContact();

  // Navigation
  const [navRoute, setNavRoute] = useState<NavRoute | null>(null);
  const [navLoading, setNavLoading] = useState(false);
  const [navPanel, setNavPanel] = useState(false);
  const [navMode, setNavMode] = useState<NavMode>("car");
  const [navActive, setNavActive] = useState(false);
  const [navStepIdx, setNavStepIdx] = useState(0);
  const [navDistToNextM, setNavDistToNextM] = useState<number | null>(null);
  const [navOffRoute, setNavOffRoute] = useState(false);
  const navTargetRef = useRef<{ lat: number; lng: number } | null>(null);
  const navModeRef = useRef<NavMode>("car");
  const navStepIdxRef = useRef(0);
  const userPosRef = useRef<[number,number] | null>(null);
  const offRouteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchRouteRef = useRef<((lat: number, lng: number, mode?: NavMode) => Promise<void>) | null>(null);

  // Quick add modal (sudo "+" button)
  const [addModal, setAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", description: "", categoryId: "" });
  const [addLat, setAddLat] = useState(41.2995);
  const [addLng, setAddLng] = useState(69.2401);
  const [addShowPicker, setAddShowPicker] = useState(true);
  const [addPending, setAddPending] = useState(false);

  const isSudo = user?.role === "sudo";
  const isAdmin = user?.role === "admin";
  const hasPremium = isSudo || user?.role === "premium" || !!user?.isPremium;
  const premiumActive = !!(settings?.premiumEnabled);
  // Admin o'z biriktirilgan nuqtasi uchun to'liq huquqqa ega
  const canViewFullPoint = (p: any) => !premiumActive || hasPremium || (isAdmin && p?.id === user?.assignedPointId);
  const canEditPoint = (p: any) => isSudo || (isAdmin && p?.id === user?.assignedPointId);
  const canSearch = !premiumActive || hasPremium;
  const savedCount = (allPoints ?? []).filter((p: any) => p.isSaved).length;
  const maxSavesReached = premiumActive && !hasPremium && savedCount >= 1;

  // GPS tracking + userPosRef sync + GPS heading
  useEffect(() => {
    if (!navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const coords: [number,number] = [pos.coords.latitude, pos.coords.longitude];
        userPosRef.current = coords;
        setUserPos(coords);
        if (pos.coords.heading !== null && !isNaN(pos.coords.heading)) {
          setUserHeading(pos.coords.heading);
        }
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 }
    );
    watchIdRef.current = id;
    return () => { if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current); };
  }, []);

  // Device orientation (compass) — GPS heading'dan ko'ra aniqroq
  useEffect(() => {
    const handler = (e: DeviceOrientationEvent) => {
      // iOS: webkitCompassHeading (0=North, clockwise)
      const ios = (e as any).webkitCompassHeading;
      if (typeof ios === "number" && !isNaN(ios)) { setUserHeading(ios); return; }
      // Android: alpha (0=North, counter-clockwise) → convert
      if (e.alpha !== null && e.absolute) { setUserHeading((360 - e.alpha) % 360); }
    };
    window.addEventListener("deviceorientationabsolute", handler as EventListener, true);
    window.addEventListener("deviceorientation", handler as EventListener, true);
    return () => {
      window.removeEventListener("deviceorientationabsolute", handler as EventListener, true);
      window.removeEventListener("deviceorientation", handler as EventListener, true);
    };
  }, []);

  // Sync navMode to ref (for use inside callbacks/timers)
  useEffect(() => { navModeRef.current = navMode; }, [navMode]);

  // Real-time navigation tracking
  useEffect(() => {
    if (!navActive || !navRoute || !userPos) return;
    const pos = userPos;
    const steps = navRoute.steps;

    // Auto-follow: xaritani foydalanuvchiga qaratish (foydalanuvchi zoom'ini saqlab)
    if (mapRef.current) {
      const curZoom = mapRef.current.getZoom();
      // Faqat juda kichik zoom bo'lsa kattalashtiradi, aks holda foydalanuvchi zoom'i saqlanadi
      const followZoom = curZoom < 13 ? 15 : curZoom;
      mapRef.current.setView(pos, followZoom, { animate: true, duration: 0.4 });
    }

    // Navbatdagi qadamni o'tib ketganini tekshirish (30m ichida)
    let idx = navStepIdxRef.current;
    while (idx < steps.length - 1) {
      const d = haversineDist(pos, steps[idx + 1].location);
      if (d < 30) idx++;
      else break;
    }
    if (idx !== navStepIdxRef.current) {
      navStepIdxRef.current = idx;
      setNavStepIdx(idx);
    }

    // Keyingi burilishgacha masofa
    if (idx < steps.length) {
      setNavDistToNextM(Math.round(haversineDist(pos, steps[idx].location)));
    }

    // Manzilga yetib kelish
    if (idx === steps.length - 1 && haversineDist(pos, steps[idx].location) < 25) {
      toast({ title: "🏁 Manzilga yetib keldingiz!" });
      setNavActive(false);
      if (offRouteTimerRef.current) { clearTimeout(offRouteTimerRef.current); offRouteTimerRef.current = null; }
      return;
    }

    // Yo'ldan chiqish tekshiruvi (80m dan ko'p)
    const offDist = distToRoute(pos, navRoute.coords);
    if (offDist > 80) {
      setNavOffRoute(true);
      if (!offRouteTimerRef.current) {
        offRouteTimerRef.current = setTimeout(() => {
          offRouteTimerRef.current = null;
          const target = navTargetRef.current;
          const curPos = userPosRef.current;
          if (target && curPos && fetchRouteRef.current) {
            toast({ title: "Yo'l qayta hisoblanmoqda...", description: "Yo'ldan chiqdingiz" });
            fetchRouteRef.current(target.lat, target.lng, navModeRef.current);
          }
          setNavOffRoute(false);
        }, 5000);
      }
    } else {
      setNavOffRoute(false);
      if (offRouteTimerRef.current) { clearTimeout(offRouteTimerRef.current); offRouteTimerRef.current = null; }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userPos, navActive, navRoute]);

  useEffect(() => { if (isError) setLocation("/login"); }, [isError, setLocation]);

  // Search
  useEffect(() => {
    if (!searchQuery.trim() || !allPoints) { setSearchResults([]); return; }
    const q = searchQuery.toLowerCase();
    setSearchResults(
      allPoints.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.description?.toLowerCase().includes(q)) ||
        (p.category?.name?.toLowerCase().includes(q))
      ).slice(0, 8)
    );
  }, [searchQuery, allPoints]);

  const filteredPoints = useMemo(
    () => (allPoints ?? []).filter(p => !selectedCategoryId || p.categoryId === selectedCategoryId),
    [allPoints, selectedCategoryId]
  );

  const handleSelectPoint = useCallback((point: any) => {
    setSelectedPoint(point);
    setFlyTo({ lat: point.lat, lng: point.lng });
    setSearchQuery("");
    setSearchResults([]);
  }, []);

  const handleToggleSave = (point: any) => {
    const nowSaved = !point.isSaved;
    // Premium limit tekshirish
    if (nowSaved && maxSavesReached) {
      toast({ title: "Premium talab qilinadi", description: "Saqlab olish limiti 1 ta. Ko'proq saqlash uchun Premium oling.", variant: "destructive" });
      return;
    }
    const mut = point.isSaved ? unsavePoint : savePoint;
    // Optimistic update — darhol UI'ni yangilash
    setSelectedPoint((prev: any) => prev ? { ...prev, isSaved: nowSaved } : prev);
    mut.mutate({ pointId: point.id }, {
      onSuccess: () => {
        toast({ title: nowSaved ? "Saqlandi" : "Saqlangandan olib tashlandi" });
        qc.invalidateQueries({ queryKey: getListPointsQueryKey() });
      },
      onError: () => {
        // Xato bo'lsa orqaga qaytarish
        setSelectedPoint((prev: any) => prev ? { ...prev, isSaved: !nowSaved } : prev);
        toast({ title: "Xato yuz berdi", variant: "destructive" });
      },
    });
  };

  const recenterToUser = () => {
    if (userPos && mapRef.current) {
      mapRef.current.flyTo(userPos, Math.max(mapRef.current.getZoom(), 15), { duration: 0.8 });
    } else {
      toast({ title: "Joylashuv aniqlanmoqda...", description: "GPS ruxsatini tekshiring" });
    }
  };

  const fetchRoute = async (toLat: number, toLng: number, forceMode?: NavMode) => {
    const curPos = userPosRef.current ?? userPos;
    if (!curPos) {
      toast({ title: "GPS aniqlanmadi", description: "Joylashuvingizni yoqing va qayta urining", variant: "destructive" });
      return;
    }
    navTargetRef.current = { lat: toLat, lng: toLng };
    setNavLoading(true);
    try {
      const [fromLat, fromLng] = curPos;
      const activeMode = forceMode ?? navModeRef.current;
      const osrmProfile = activeMode === "car" ? "driving" : activeMode === "bike" ? "cycling" : "foot";
      const url = `https://router.project-osrm.org/route/v1/${osrmProfile}/${fromLng},${fromLat};${toLng},${toLat}?steps=true&geometries=geojson&overview=full`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Server xatosi");
      const data = await res.json();
      if (data.code !== "Ok" || !data.routes?.length) throw new Error("Yo'l topilmadi");
      const r = data.routes[0];
      const coords: [number,number][] = r.geometry.coordinates.map(([lng, lat]: number[]) => [lat, lng] as [number,number]);
      const steps: NavStep[] = r.legs[0].steps
        .filter((s: any) => s.distance > 0 || s.maneuver.type === "arrive")
        .map((s: any) => ({
          instruction: translateManeuver(s.maneuver),
          distanceM: Math.round(s.distance),
          icon: maneuverIcon(s.maneuver.type, s.maneuver.modifier),
          location: [s.maneuver.location[1], s.maneuver.location[0]] as [number,number],
        }));
      // Reset navigation state when route is refreshed
      navStepIdxRef.current = 0;
      setNavStepIdx(0);
      setNavDistToNextM(null);
      setNavRoute({ coords, distanceKm: r.distance / 1000, drivingSec: r.duration, steps });
      // Only show panel when not actively navigating
      if (!navActive) {
        setNavPanel(true);
        if (mapRef.current && coords.length > 1) {
          const latlngs = coords.map(c => L.latLng(c[0], c[1]));
          mapRef.current.fitBounds(L.latLngBounds(latlngs), { padding: [60, 60] });
        }
      }
    } catch (e: any) {
      toast({ title: "Marshrut xatosi", description: e.message, variant: "destructive" });
    } finally {
      setNavLoading(false);
    }
  };

  // Keep fetchRouteRef always up-to-date (for use in timers)
  fetchRouteRef.current = fetchRoute;

  const closeNav = () => {
    setNavPanel(false);
    setNavRoute(null);
    setNavActive(false);
    setNavStepIdx(0);
    navStepIdxRef.current = 0;
    setNavDistToNextM(null);
    setNavOffRoute(false);
    navTargetRef.current = null;
    if (offRouteTimerRef.current) { clearTimeout(offRouteTimerRef.current); offRouteTimerRef.current = null; }
  };

  const openEditModal = (point: any) => {
    editingPointRef.current = point;
    setEditForm({
      name: point.name,
      description: point.description ?? "",
      lat: String(point.lat),
      lng: String(point.lng),
      categoryId: point.categoryId ? String(point.categoryId) : "",
    });
    setEditContacts(point.contacts || []);
    setEditContactForm({ type: "phone", label: "", value: "" });
    setEditShowPicker(false);
    setSelectedPoint(null);
    setEditModal(true);
  };

  const saveEdit = () => {
    const pt = editingPointRef.current;
    if (!pt) return;
    updatePoint.mutate({
      id: pt.id,
      data: {
        name: editForm.name,
        description: editForm.description || null,
        lat: parseFloat(editForm.lat),
        lng: parseFloat(editForm.lng),
        categoryId: editForm.categoryId ? parseInt(editForm.categoryId) : null,
      }
    }, {
      onSuccess: () => {
        toast({ title: "Nuqta yangilandi" });
        setEditModal(false);
        qc.invalidateQueries({ queryKey: getListPointsQueryKey() });
        setFlyTo({ lat: parseFloat(editForm.lat), lng: parseFloat(editForm.lng) });
      },
      onError: (e) => toast({ title: "Xato", description: e.message, variant: "destructive" }),
    });
  };

  const handleImgUpload = async (file: File) => {
    const pt = editingPointRef.current;
    if (!pt) return;
    setUploadingImg(true);
    try {
      await uploadPointImage(pt.id, file);
      toast({ title: "Rasm qo'shildi" });
      qc.invalidateQueries({ queryKey: getListPointsQueryKey() });
    } catch (e: any) {
      toast({ title: "Yuklash xatosi", description: e.message, variant: "destructive" });
    } finally { setUploadingImg(false); }
  };

  // Quick add
  const openAddModal = () => {
    const lat = userPos ? userPos[0] : 41.2995;
    const lng = userPos ? userPos[1] : 69.2401;
    setAddLat(lat);
    setAddLng(lng);
    setAddForm({ name: "", description: "", categoryId: "" });
    setAddShowPicker(true);
    setSelectedPoint(null); // detail panelni yopish
    setAddModal(true);
  };

  const saveNewPoint = async () => {
    if (!addForm.name.trim()) return;
    setAddPending(true);
    createPoint.mutate({
      data: {
        name: addForm.name,
        description: addForm.description || null,
        lat: addLat,
        lng: addLng,
        categoryId: addForm.categoryId ? parseInt(addForm.categoryId) : null,
      }
    }, {
      onSuccess: (created) => {
        toast({ title: "Nuqta qo'shildi" });
        qc.invalidateQueries({ queryKey: getListPointsQueryKey() });
        setAddModal(false);
        setAddPending(false);
        setFlyTo({ lat: addLat, lng: addLng });
      },
      onError: (e) => { toast({ title: "Xato", description: e.message, variant: "destructive" }); setAddPending(false); },
    });
  };

  const tileUrl = theme === "dark"
    ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
    : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

  if (!user) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="relative w-full h-[100dvh] overflow-hidden">
      {/* ── MAP ── */}
      <MapContainer center={[41.2995, 69.2401]} zoom={12} className="w-full h-full" zoomControl={false}>
        <TileLayer url={tileUrl} attribution="&copy; OpenStreetMap/CARTO" />
        <MapController mapRef={mapRef} />
        <FlyToUserOnStart />
        {flyTo && <FlyToPoint lat={flyTo.lat} lng={flyTo.lng} />}

        {/* User location with direction arrow */}
        {userPos && (
          <Marker
            position={userPos}
            icon={createUserLocIcon(userHeading)}
            zIndexOffset={2000}
            interactive={false}
          />
        )}

        {/* Clustered points */}
        <ClusterLayer
          points={filteredPoints}
          selectedId={selectedPoint?.id ?? null}
          onSelect={handleSelectPoint}
          theme={theme}
        />

        {/* Navigation route polyline */}
        {navRoute && (
          <Polyline
            positions={navRoute.coords}
            pathOptions={{ color: "#3b82f6", weight: 5, opacity: 0.85, lineCap: "round", lineJoin: "round" }}
          />
        )}
      </MapContainer>

      {/* ── TOP OVERLAY ── */}
      <div className="absolute top-0 left-0 right-0 z-[1000] pointer-events-none">
        <div className="p-3 flex gap-2 items-start">
          {/* Search */}
          <div className="flex-1 max-w-md pointer-events-auto relative">
            {canSearch ? (
              <>
                <div className="flex items-center bg-background/90 backdrop-blur-md border rounded-xl shadow-lg px-3 h-11">
                  <Search className="w-4 h-4 text-muted-foreground shrink-0 mr-2" />
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Qidirish..."
                    className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
                  />
                  {searchQuery && (
                    <button onClick={() => { setSearchQuery(""); setSearchResults([]); }}
                      className="text-muted-foreground hover:text-foreground ml-1">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                {searchResults.length > 0 && (
                  <div className="absolute top-full mt-2 w-full bg-background/95 backdrop-blur-md border rounded-xl shadow-2xl overflow-hidden z-50">
                    {searchResults.map((result) => (
                      <button key={result.id} onClick={() => handleSelectPoint(result)}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted transition-colors text-left border-b last:border-0">
                        <div className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center"
                          style={{ backgroundColor: (result.category?.color ?? "#3b82f6") + "22" }}>
                          <MapPin className="w-4 h-4" style={{ color: result.category?.color ?? "#3b82f6" }} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm truncate">{result.name}</p>
                          {result.category && <p className="text-xs text-muted-foreground">{result.category.name}</p>}
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center bg-background/90 backdrop-blur-md border rounded-xl shadow-lg px-3 h-11 gap-2">
                <Search className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="flex-1 text-sm text-muted-foreground">Qidirish...</span>
                <div className="flex items-center gap-1 bg-yellow-500/15 border border-yellow-500/30 rounded-full px-2 py-0.5 shrink-0">
                  <Crown className="w-3 h-3 text-yellow-400" />
                  <span className="text-xs text-yellow-500 font-medium">Premium</span>
                </div>
              </div>
            )}
          </div>

          {/* Right controls */}
          <div className="pointer-events-auto flex items-center gap-1.5">
            <Button variant="secondary" size="icon" className="h-11 w-11 rounded-xl bg-background/90 backdrop-blur-md border shadow-lg"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>
            {user.role === "sudo" && (
              <Button variant="secondary" size="icon" className="h-11 w-11 rounded-xl bg-background/90 backdrop-blur-md border shadow-lg"
                onClick={() => setLocation("/sudo")}>
                <Settings className="w-4 h-4" />
              </Button>
            )}
            {user.role === "admin" && (
              <Button variant="secondary" size="icon" className="h-11 w-11 rounded-xl bg-background/90 backdrop-blur-md border shadow-lg"
                onClick={() => setLocation("/admin")}>
                <Shield className="w-4 h-4" />
              </Button>
            )}
            <Avatar className="h-11 w-11 border-2 border-primary cursor-pointer shadow-lg"
              onClick={() => setLocation("/profile")}>
              <AvatarFallback className="bg-background/90 backdrop-blur-md text-sm font-bold">
                {user.name?.substring(0, 2).toUpperCase() || "U"}
              </AvatarFallback>
            </Avatar>
          </div>
        </div>

        {/* Category chips */}
        <div className="pointer-events-auto px-3 pb-2 overflow-x-auto scrollbar-hide">
          <div className="flex gap-2 w-max">
            <button onClick={() => setSelectedCategoryId(null)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border shadow-sm backdrop-blur-md transition-colors
                ${!selectedCategoryId ? "bg-primary text-primary-foreground border-primary" : "bg-background/90 text-foreground border-border hover:bg-muted"}`}>
              Barchasi
            </button>
            {categories?.map((cat) => (
              <button key={cat.id} onClick={() => setSelectedCategoryId(selectedCategoryId === cat.id ? null : cat.id)}
                className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border shadow-sm backdrop-blur-md transition-colors
                  ${selectedCategoryId === cat.id ? "text-white border-transparent" : "bg-background/90 text-foreground border-border hover:bg-muted"}`}
                style={selectedCategoryId === cat.id ? { backgroundColor: cat.color, borderColor: cat.color } : {}}>
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: cat.color }} />
                {cat.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── BOTTOM RIGHT CONTROLS ── */}
      <div className="absolute bottom-6 right-4 z-[1000] flex flex-col gap-2 pointer-events-auto">
        {/* Sudo: Quick add point */}
        {isSudo && (
          <Button size="icon"
            className="h-12 w-12 rounded-xl shadow-xl bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={openAddModal}
            title="Yangi nuqta qo'shish">
            <Plus className="w-5 h-5" />
          </Button>
        )}

        {/* Re-center to user location */}
        <Button size="icon"
          className="h-12 w-12 rounded-xl shadow-xl bg-background/90 backdrop-blur-md border text-foreground hover:bg-muted"
          onClick={recenterToUser}
          title="Mening joylashuvim">
          <Navigation2 className={`w-5 h-5 ${userPos ? "text-blue-500" : "text-muted-foreground"}`} />
        </Button>

        {/* Saved */}
        <Button size="icon"
          className="h-12 w-12 rounded-xl shadow-xl bg-background/90 backdrop-blur-md border text-foreground hover:bg-muted"
          onClick={() => setLocation("/saved")}>
          <Bookmark className="w-5 h-5" />
        </Button>
      </div>

      {/* ── POINT DETAIL PANEL ── */}
      {selectedPoint && (
        <div className="absolute bottom-0 left-0 right-0 z-[1000] pointer-events-auto"
          style={{ transform: `translateY(${panelDragY}px)`, transition: panelDragY === 0 ? "transform 0.25s ease" : "none" }}>
          <div className="bg-background/96 backdrop-blur-md border-t rounded-t-3xl shadow-2xl max-h-[72vh] overflow-y-auto">
            <div className="flex justify-center pt-3 pb-1 cursor-grab active:cursor-grabbing"
              onTouchStart={onPanelTouchStart}
              onTouchMove={onPanelTouchMove}
              onTouchEnd={onPanelTouchEnd}>
              <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
            </div>

            {selectedPoint.images?.length > 0 && (
              <div className="flex gap-2 px-4 pb-3 overflow-x-auto scrollbar-hide">
                {selectedPoint.images.map((img: any, idx: number) => (
                  <button
                    key={img.id}
                    onClick={() => openLightbox(selectedPoint.images.map((i: any) => i.url), idx)}
                    className="shrink-0 rounded-xl overflow-hidden border focus:outline-none active:scale-95 transition-transform"
                  >
                    <img src={img.url} alt="" className="h-28 w-40 object-cover" />
                  </button>
                ))}
              </div>
            )}

            <div className="px-4 pb-6">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-lg md:text-xl font-bold">{selectedPoint.name}</h2>
                    {selectedPoint.category && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium border shrink-0"
                        style={{
                          color: selectedPoint.category.color,
                          borderColor: selectedPoint.category.color + "50",
                          backgroundColor: selectedPoint.category.color + "15",
                        }}>
                        {selectedPoint.category.name}
                      </span>
                    )}
                  </div>
                  {selectedPoint.description && (
                    <p className="text-sm text-muted-foreground mt-1">{selectedPoint.description}</p>
                  )}
                </div>

                <div className="flex gap-1.5 shrink-0">
                  {/* Navigate button */}
                  <Button
                    variant="outline" size="icon"
                    className={`h-9 w-9 rounded-xl ${navPanel && navTargetRef.current?.lat === selectedPoint.lat ? "border-blue-500 text-blue-500" : ""}`}
                    title="Yo'l ko'rsatish"
                    disabled={navLoading}
                    onClick={() => {
                      if (navPanel && navTargetRef.current?.lat === selectedPoint.lat) { closeNav(); return; }
                      fetchRoute(selectedPoint.lat, selectedPoint.lng);
                    }}
                  >
                    {navLoading
                      ? <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      : <Route className="w-4 h-4" />}
                  </Button>

                  {canEditPoint(selectedPoint) && (
                    <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl"
                      onClick={() => openEditModal(selectedPoint)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                  )}
                  <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl"
                    onClick={() => handleToggleSave(selectedPoint)}
                    title={maxSavesReached && !selectedPoint.isSaved ? "Premium talab qilinadi" : ""}>
                    {selectedPoint.isSaved
                      ? <BookmarkCheck className="w-4 h-4 text-primary" />
                      : maxSavesReached
                        ? <div className="relative"><Bookmark className="w-4 h-4 text-yellow-400" /><Crown className="w-2.5 h-2.5 text-yellow-400 absolute -top-1 -right-1" /></div>
                        : <Bookmark className="w-4 h-4" />}
                  </Button>
                  {canViewFullPoint(selectedPoint) ? (
                    <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl" asChild>
                      <a href={`/vizitka/${selectedPoint.vizitkaCode}`} target="_blank" rel="noreferrer">
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </Button>
                  ) : (
                    <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl opacity-50 cursor-not-allowed" title="Premium talab qilinadi">
                      <ExternalLink className="w-4 h-4 text-muted-foreground" />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl"
                    onClick={() => setSelectedPoint(null)}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Contacts */}
              {selectedPoint.contacts?.length > 0 ? (
                <div className="space-y-2">
                  {selectedPoint.contacts.map((c: any) => {
                    const locked = !canViewFullPoint(selectedPoint);
                    if (locked) {
                      return (
                        <div key={c.id} className="flex items-center gap-3 p-3 rounded-xl border bg-muted/30">
                          <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                            {c.type === "phone" && <Phone className="w-4 h-4 text-muted-foreground" />}
                            {c.type === "telegram" && <SiTelegram className="w-4 h-4 text-muted-foreground" />}
                            {c.type === "instagram" && <SiInstagram className="w-4 h-4 text-muted-foreground" />}
                          </div>
                          <div className="flex-1">
                            <p className="text-sm text-muted-foreground blur-sm select-none">••••••••</p>
                            <div className="flex items-center gap-1 mt-0.5">
                              <Crown className="w-3 h-3 text-yellow-400" />
                              <p className="text-xs text-yellow-500 font-medium">Premium talab qilinadi</p>
                            </div>
                          </div>
                        </div>
                      );
                    }
                    const href = c.type === "phone" ? `tel:${c.value}`
                      : c.type === "telegram" ? `https://t.me/${c.value.replace("@", "")}`
                      : c.type === "instagram" ? `https://instagram.com/${c.value.replace("@", "")}`
                      : c.value;
                    return (
                      <a key={c.id} href={href} target={c.type !== "phone" ? "_blank" : undefined} rel="noreferrer"
                        className="flex items-center gap-3 p-3 rounded-xl border hover:bg-muted transition-colors">
                        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                          {c.type === "phone" && <Phone className="w-4 h-4" />}
                          {c.type === "telegram" && <SiTelegram className="w-4 h-4" />}
                          {c.type === "instagram" && <SiInstagram className="w-4 h-4" />}
                          {c.type === "website" && <Globe className="w-4 h-4" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{c.label || c.value}</p>
                          <p className="text-xs text-muted-foreground capitalize">{c.type}</p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                      </a>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">Kontakt yo'q</p>
              )}

              {!canViewFullPoint(selectedPoint) && (
                <div className="mt-3 p-3 rounded-xl border border-yellow-500/30 bg-yellow-500/5 flex items-center gap-3">
                  <Crown className="w-4 h-4 text-yellow-400 shrink-0" />
                  <p className="text-xs text-muted-foreground">
                    To'liq ma'lumot uchun <span className="text-yellow-400 font-medium">Premium</span> talab qilinadi.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── ACTIVE NAVIGATION OVERLAY (compact) ── */}
      {navActive && navRoute && (
        <div className="absolute top-0 left-0 right-0 z-[1200] pointer-events-auto">
          <div className="mx-3 mt-3 space-y-1.5">

            {/* Current instruction — slim card */}
            <div className={`rounded-2xl shadow-xl transition-colors ${navOffRoute ? "bg-orange-500" : "bg-blue-600"} text-white`}>
              <div className="flex items-center gap-2.5 px-3 py-2.5">
                {/* Icon */}
                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-2xl shrink-0">
                  {navRoute.steps[navStepIdx]?.icon ?? "⬆"}
                </div>
                {/* Text */}
                <div className="flex-1 min-w-0">
                  {navOffRoute && (
                    <p className="text-[10px] font-bold text-white/70 uppercase tracking-wider leading-none mb-0.5">⚠ Yo'ldan chiqdingiz</p>
                  )}
                  <p className="font-bold text-base leading-snug truncate">
                    {navRoute.steps[navStepIdx]?.instruction ?? "Davom eting"}
                  </p>
                  {navDistToNextM !== null && navStepIdx < navRoute.steps.length - 1 && (
                    <p className={`text-xs font-semibold leading-none mt-0.5 ${navOffRoute ? "text-orange-100" : "text-blue-200"}`}>
                      {formatDistM(navDistToNextM)} keyin
                    </p>
                  )}
                </div>
                {/* Close */}
                <button onClick={closeNav} className="w-8 h-8 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center shrink-0">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Next turn — ultra-slim */}
              {navStepIdx + 1 < navRoute.steps.length && (
                <div className={`flex items-center gap-2 px-3 pb-2 ${navOffRoute ? "text-orange-100" : "text-blue-200"}`}>
                  <span className="text-[11px]">Keyin:</span>
                  <span className="text-sm">{navRoute.steps[navStepIdx + 1]?.icon}</span>
                  <span className="text-[11px] truncate">{navRoute.steps[navStepIdx + 1]?.instruction}</span>
                </div>
              )}
              {navStepIdx === navRoute.steps.length - 1 && (
                <p className="px-3 pb-2 text-[11px] text-blue-200">🏁 Manzilga yaqinlashmoqdasiz</p>
              )}
            </div>

            {/* Distance + list toggle — tiny pill row */}
            <div className="flex gap-1.5">
              <div className="flex-1 bg-background/90 backdrop-blur-sm rounded-xl px-2.5 py-1.5 flex items-center gap-1.5 border">
                <Milestone className="w-3 h-3 text-blue-500 shrink-0" />
                <span className="text-xs font-semibold text-blue-500">{formatDist(navRoute.distanceKm)}</span>
                <span className="text-muted-foreground/50 text-xs">·</span>
                <Clock className="w-3 h-3 text-muted-foreground shrink-0" />
                <span className="text-xs text-muted-foreground">
                  {navMode === "car" ? formatTime(navRoute.drivingSec) : navMode === "bike" ? formatTime((navRoute.distanceKm/15)*3600) : formatTime((navRoute.distanceKm/5)*3600)}
                </span>
              </div>
              <button
                onClick={() => setNavPanel(p => !p)}
                className="bg-background/90 backdrop-blur-sm border rounded-xl px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted transition-colors"
              >
                Ro'yxat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── NAVIGATION PANEL ── */}
      {navPanel && navRoute && (
        <div className="absolute bottom-0 left-0 right-0 z-[1100] pointer-events-auto">
          <div className="bg-background/97 backdrop-blur-md border-t rounded-t-3xl shadow-2xl flex flex-col max-h-[72vh]">
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
            </div>

            {/* Header */}
            <div className="flex items-center gap-3 px-4 pb-3 shrink-0">
              <div className="flex-1">
                <p className="font-bold text-base">Marshrut</p>
                <p className="text-xs text-muted-foreground">
                  {formatDist(navRoute.distanceKm)} &nbsp;·&nbsp;
                  {navMode === "car"
                    ? formatTime(navRoute.drivingSec)
                    : navMode === "bike"
                      ? formatTime((navRoute.distanceKm / 15) * 3600)
                      : formatTime((navRoute.distanceKm / 5) * 3600)}
                </p>
              </div>
              <button onClick={closeNav} className="p-2 rounded-xl hover:bg-muted transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Transport mode selector */}
            <div className="flex gap-2 px-4 pb-3 shrink-0">
              {([
                { mode: "car" as NavMode,  label: "Mashina",    Icon: Car,        time: navRoute.drivingSec },
                { mode: "bike" as NavMode, label: "Velosiped",  Icon: Bike,       time: (navRoute.distanceKm / 15) * 3600 },
                { mode: "walk" as NavMode, label: "Piyoda",     Icon: Footprints, time: (navRoute.distanceKm / 5) * 3600 },
              ] as const).map(({ mode, label, Icon, time }) => (
                <button
                  key={mode}
                  onClick={() => {
                    setNavMode(mode);
                    if (navTargetRef.current) {
                      fetchRoute(navTargetRef.current.lat, navTargetRef.current.lng, mode);
                    }
                  }}
                  className={`flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl border text-xs font-medium transition-colors
                    ${navMode === mode
                      ? "bg-blue-500/10 border-blue-500/60 text-blue-500"
                      : "bg-muted/40 border-transparent text-muted-foreground hover:bg-muted"}`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{label}</span>
                  <span className="font-normal text-[11px] opacity-80">{formatTime(time)}</span>
                </button>
              ))}
            </div>

            {/* Distance badge */}
            <div className="flex items-center gap-2 px-4 pb-3 shrink-0">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-blue-500/10 border border-blue-500/20">
                <Milestone className="w-3.5 h-3.5 text-blue-500" />
                <span className="text-sm font-semibold text-blue-500">{formatDist(navRoute.distanceKm)}</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-muted/60 border">
                <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-sm font-medium">
                  {navMode === "car"
                    ? formatTime(navRoute.drivingSec)
                    : navMode === "bike"
                      ? formatTime((navRoute.distanceKm / 15) * 3600)
                      : formatTime((navRoute.distanceKm / 5) * 3600)}
                </span>
              </div>
            </div>

            {/* Boshlash / To'xtatish button */}
            <div className="px-4 pb-3 shrink-0">
              {navActive ? (
                <Button
                  variant="destructive"
                  className="w-full rounded-xl h-12 font-bold text-base"
                  onClick={closeNav}
                >
                  <X className="w-5 h-5 mr-2" /> Navigatsiyani to'xtatish
                </Button>
              ) : (
                <Button
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl h-12 text-base"
                  onClick={() => {
                    if (!userPosRef.current && !userPos) {
                      toast({ title: "GPS aniqlanmadi", description: "Joylashuvingizni yoqing va qayta urining", variant: "destructive" });
                      return;
                    }
                    navStepIdxRef.current = 0;
                    setNavStepIdx(0);
                    setNavDistToNextM(null);
                    setNavActive(true);
                    setNavPanel(false);
                    const pos = userPosRef.current ?? userPos;
                    if (mapRef.current && pos) {
                      mapRef.current.setView(pos, 16, { animate: true });
                    }
                  }}
                >
                  <Navigation2 className="w-5 h-5 mr-2" /> Boshlash
                </Button>
              )}
            </div>

            {/* Step-by-step directions */}
            <div className="overflow-y-auto px-4 pb-6 space-y-1.5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pb-1">Yo'riqnoma</p>
              {navRoute.steps.map((step, i) => (
                <div key={i} className={`flex items-start gap-3 p-2.5 rounded-xl transition-colors
                  ${navActive && i === navStepIdx ? "bg-blue-500/10 border border-blue-500/30" : "bg-muted/30 hover:bg-muted/50"}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-base font-bold
                    ${i === 0 ? "bg-green-500/15 text-green-500" : i === navRoute.steps.length - 1 ? "bg-blue-500/15 text-blue-500" : navActive && i === navStepIdx ? "bg-blue-500/20 text-blue-500" : "bg-muted text-foreground"}`}>
                    {step.icon}
                  </div>
                  <div className="flex-1 min-w-0 pt-0.5">
                    <p className={`text-sm font-medium leading-snug ${navActive && i === navStepIdx ? "text-blue-500" : ""}`}>{step.instruction}</p>
                    {step.distanceM > 0 && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {step.distanceM >= 1000
                          ? `${(step.distanceM / 1000).toFixed(1)} km`
                          : `${step.distanceM} m`}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── SUDO EDIT PANEL (fullscreen, z-[2000]) ── */}
      {editModal && (
        <div className="fixed inset-0 z-[2000] bg-background flex flex-col">
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b shrink-0">
            <button
              className="p-2 rounded-lg hover:bg-muted transition-colors"
              onClick={() => { setEditModal(false); setEditShowPicker(false); }}
            >
              <X className="w-5 h-5" />
            </button>
            <h2 className="font-bold text-base flex-1">
              {editShowPicker ? "Joylashuvni tanlang" : "Nuqtani tahrirlash"}
            </h2>
            {!editShowPicker && (
              <Button size="sm" onClick={saveEdit} disabled={!editForm.name || updatePoint.isPending}>
                {updatePoint.isPending
                  ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <><Save className="w-4 h-4 mr-1.5" /> Saqlash</>}
              </Button>
            )}
          </div>

          {editShowPicker ? (
            <div className="flex-1 min-h-0">
              <LocationPicker
                initialLat={parseFloat(editForm.lat) || 41.2995}
                initialLng={parseFloat(editForm.lng) || 69.2401}
                onConfirm={(lat, lng) => {
                  setEditForm(f => ({ ...f, lat: lat.toFixed(6), lng: lng.toFixed(6) }));
                  setEditShowPicker(false);
                }}
                onCancel={() => setEditShowPicker(false)}
              />
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="space-y-1.5">
                <Label>Nomi *</Label>
                <Input
                  value={editForm.name}
                  onChange={(e) => setEditForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Nuqta nomi"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Tavsif</Label>
                <Textarea
                  value={editForm.description}
                  onChange={(e) => setEditForm(f => ({ ...f, description: e.target.value }))}
                  rows={3}
                  placeholder="Tavsif (ixtiyoriy)"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Joylashuv</Label>
                <div className="flex gap-2">
                  <div className="flex-1 p-2.5 rounded-lg border bg-muted text-xs font-mono">
                    {parseFloat(editForm.lat).toFixed(5)}, {parseFloat(editForm.lng).toFixed(5)}
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={() => setEditShowPicker(true)}>
                    <MapPin className="w-4 h-4 mr-1" /> Xaritada
                  </Button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Kategoriya</Label>
                <Select value={editForm.categoryId || "none"} onValueChange={(v) => setEditForm(f => ({ ...f, categoryId: v === "none" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="Tanlang..." /></SelectTrigger>
                  <SelectContent className="z-[3000]">
                    <SelectItem value="none">Kategoriyasiz</SelectItem>
                    {categories?.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>
                  Rasmlar
                  {(editingPointRef.current?.images?.length ?? 0) > 0 && (
                    <span className="ml-1.5 text-xs text-muted-foreground font-normal">
                      ({editingPointRef.current.images.length} ta)
                    </span>
                  )}
                </Label>
                {/* Mavjud rasmlar */}
                {editingPointRef.current?.images?.length > 0 && (
                  <div className="grid grid-cols-3 gap-2">
                    {editingPointRef.current.images.map((img: any) => (
                      <div key={img.id} className="relative aspect-square rounded-lg overflow-hidden border bg-muted">
                        <img
                          src={img.url}
                          alt="rasm"
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ))}
                  </div>
                )}
                {/* Yangi rasm qo'shish */}
                <label className={`flex items-center gap-2 p-3 rounded-lg border border-dashed cursor-pointer hover:bg-muted transition-colors ${uploadingImg ? "opacity-60 pointer-events-none" : ""}`}>
                  {uploadingImg
                    ? <><div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" /><span className="text-sm text-muted-foreground">Yuklanmoqda...</span></>
                    : <><ImageIcon className="w-4 h-4 text-muted-foreground" /><span className="text-sm text-muted-foreground">Galereyadan yangi rasm qo'shish</span></>}
                  <input type="file" accept="image/*" className="hidden" disabled={uploadingImg}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImgUpload(f); e.target.value = ""; }} />
                </label>
              </div>

              {/* Kontaktlar */}
              <div className="space-y-1.5">
                <Label>Kontaktlar</Label>
                {editContacts.length > 0 && (
                  <div className="space-y-1.5">
                    {editContacts.map((c: any) => (
                      <div key={c.id} className="flex items-center gap-2 p-2.5 rounded-lg border bg-muted/30">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-primary">
                          {c.type === "phone" && <Phone className="w-3.5 h-3.5" />}
                          {c.type === "telegram" && <SiTelegram className="w-3.5 h-3.5" />}
                          {c.type === "instagram" && <SiInstagram className="w-3.5 h-3.5" />}
                          {c.type === "website" && <Globe className="w-3.5 h-3.5" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{c.label || c.value}</p>
                          <p className="text-xs text-muted-foreground capitalize">{c.type}</p>
                        </div>
                        <button
                          className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                          onClick={async () => {
                            const pt = editingPointRef.current;
                            if (!pt) return;
                            try {
                              await deleteContactMutation.mutateAsync({ id: pt.id, contactId: c.id });
                              const updated = editContacts.filter((x: any) => x.id !== c.id);
                              editingPointRef.current = { ...pt, contacts: updated };
                              setEditContacts(updated);
                              qc.invalidateQueries({ queryKey: getListPointsQueryKey() });
                              toast({ title: "Kontakt o'chirildi" });
                            } catch (e: any) {
                              toast({ title: "Xato", description: e.message, variant: "destructive" });
                            }
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {/* Yangi kontakt qo'shish */}
                <div className="p-3 rounded-lg border border-dashed space-y-2">
                  <Select value={editContactForm.type} onValueChange={(v) => setEditContactForm(f => ({ ...f, type: v }))}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent className="z-[3000]">
                      <SelectItem value="phone">Telefon</SelectItem>
                      <SelectItem value="telegram">Telegram</SelectItem>
                      <SelectItem value="instagram">Instagram</SelectItem>
                      <SelectItem value="website">Website</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    className="h-8 text-xs"
                    placeholder={
                      editContactForm.type === "phone" ? "+998901234567" :
                      editContactForm.type === "telegram" ? "@username" :
                      editContactForm.type === "instagram" ? "@username" : "https://..."
                    }
                    value={editContactForm.value}
                    onChange={(e) => setEditContactForm(f => ({ ...f, value: e.target.value }))}
                  />
                  <Input
                    className="h-8 text-xs"
                    placeholder="Belgi (ixtiyoriy, masalan: Asosiy, Do'kon)"
                    value={editContactForm.label}
                    onChange={(e) => setEditContactForm(f => ({ ...f, label: e.target.value }))}
                  />
                  <Button
                    size="sm"
                    className="w-full h-8 text-xs"
                    disabled={!editContactForm.value.trim() || addingContact}
                    onClick={async () => {
                      const pt = editingPointRef.current;
                      if (!pt || !editContactForm.value.trim()) return;
                      setAddingContact(true);
                      try {
                        const newC = await addContactMutation.mutateAsync({
                          id: pt.id,
                          data: {
                            type: editContactForm.type as "phone" | "telegram" | "instagram" | "website",
                            value: editContactForm.value.trim(),
                            label: editContactForm.label.trim() || null,
                          },
                        });
                        const updated = [...editContacts, newC];
                        editingPointRef.current = { ...pt, contacts: updated };
                        setEditContacts(updated);
                        setEditContactForm(f => ({ ...f, value: "", label: "" }));
                        qc.invalidateQueries({ queryKey: getListPointsQueryKey() });
                        toast({ title: "Kontakt qo'shildi" });
                      } catch (e: any) {
                        toast({ title: "Xato", description: e.message, variant: "destructive" });
                      } finally { setAddingContact(false); }
                    }}
                  >
                    {addingContact
                      ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      : <><Plus className="w-3.5 h-3.5 mr-1" /> Qo'shish</>}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── SUDO QUICK ADD PANEL (fullscreen, z-[2000]) ── */}
      {addModal && (
        <div className="fixed inset-0 z-[2000] bg-background flex flex-col">
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b shrink-0">
            <button
              className="p-2 rounded-lg hover:bg-muted transition-colors"
              onClick={() => { setAddModal(false); setAddShowPicker(true); }}
            >
              <X className="w-5 h-5" />
            </button>
            <h2 className="font-bold text-base flex-1">
              {addShowPicker ? "Joylashuvni belgilang" : "Yangi nuqta"}
            </h2>
            {!addShowPicker && (
              <Button size="sm" onClick={saveNewPoint} disabled={!addForm.name.trim() || addPending}>
                {addPending
                  ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <><Plus className="w-4 h-4 mr-1" /> Qo'shish</>}
              </Button>
            )}
          </div>

          {addShowPicker ? (
            <div className="flex-1 min-h-0">
              <LocationPicker
                initialLat={addLat}
                initialLng={addLng}
                onConfirm={(lat, lng) => {
                  setAddLat(lat);
                  setAddLng(lng);
                  setAddShowPicker(false);
                }}
                onCancel={() => { setAddModal(false); setAddShowPicker(true); }}
              />
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Mini koordinata */}
              <div className="flex items-center gap-2 p-2.5 rounded-lg border bg-muted/50">
                <MapPin className="w-4 h-4 text-primary shrink-0" />
                <span className="text-xs font-mono flex-1">{addLat.toFixed(5)}, {addLng.toFixed(5)}</span>
                <button onClick={() => setAddShowPicker(true)} className="text-xs text-primary hover:underline shrink-0">
                  O'zgartirish
                </button>
              </div>
              <div className="space-y-1.5">
                <Label>Nomi *</Label>
                <Input
                  autoFocus
                  value={addForm.name}
                  onChange={(e) => setAddForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Nuqta nomi"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Tavsif</Label>
                <Textarea
                  value={addForm.description}
                  onChange={(e) => setAddForm(f => ({ ...f, description: e.target.value }))}
                  rows={3}
                  placeholder="Tavsif (ixtiyoriy)"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Kategoriya</Label>
                <Select value={addForm.categoryId || "none"} onValueChange={(v) => setAddForm(f => ({ ...f, categoryId: v === "none" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="Tanlang..." /></SelectTrigger>
                  <SelectContent className="z-[3000]">
                    <SelectItem value="none">Kategoriyasiz</SelectItem>
                    {categories?.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </div>
      )}
      {/* ── LIGHTBOX ── */}
      {lightboxIdx !== null && lightboxImages.length > 0 && (
        <div className="fixed inset-0 z-[4000] bg-black/95 flex flex-col select-none">
          {/* Top bar */}
          <div className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0 z-10">
            <div className="flex items-center gap-2">
              <span className="text-white/60 text-sm font-medium">
                {lightboxIdx + 1} / {lightboxImages.length}
              </span>
              {imgScale > 1 && (
                <button
                  onClick={resetImgTransform}
                  className="text-xs px-2 py-0.5 rounded-full bg-white/15 text-white/80"
                >
                  {Math.round(imgScale * 10) / 10}× · Asl o'lcham
                </button>
              )}
            </div>
            <button
              onClick={closeLightbox}
              className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
            >
              <X className="w-6 h-6 text-white" />
            </button>
          </div>

          {/* Image area with pinch-zoom */}
          <div
            className="flex-1 flex items-center justify-center relative overflow-hidden"
            style={{ touchAction: imgScale > 1 ? "none" : "pan-y" }}
            onTouchStart={handleImgTouchStart}
            onTouchMove={handleImgTouchMove}
            onTouchEnd={(e) => {
              handleImgTouchEnd(e);
              // Swipe to navigate only when not zoomed
              if (imgScale <= 1 && lightboxTouchX.current !== null) {
                const dx = e.changedTouches[0].clientX - lightboxTouchX.current;
                if (dx < -50) lightboxNext();
                else if (dx > 50) lightboxPrev();
                lightboxTouchX.current = null;
              }
            }}
            onWheel={(e) => {
              e.preventDefault();
              const factor = e.deltaY < 0 ? 1.12 : 0.89;
              setImgScale(s => {
                const next = Math.min(6, Math.max(1, s * factor));
                if (next <= 1) setImgTranslate({ x: 0, y: 0 });
                return next;
              });
            }}
          >
            {/* Prev arrow — only show when not zoomed */}
            {lightboxIdx > 0 && imgScale <= 1 && (
              <button
                onClick={lightboxPrev}
                className="absolute left-3 z-10 w-10 h-10 rounded-full bg-white/10 hover:bg-white/25 flex items-center justify-center transition-colors"
              >
                <svg viewBox="0 0 24 24" className="w-6 h-6 text-white" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 18l-6-6 6-6"/>
                </svg>
              </button>
            )}

            <img
              src={lightboxImages[lightboxIdx]}
              alt=""
              draggable={false}
              style={{
                maxWidth: "100%",
                maxHeight: "100%",
                objectFit: "contain",
                transform: `scale(${imgScale}) translate(${imgTranslate.x / imgScale}px, ${imgTranslate.y / imgScale}px)`,
                transformOrigin: "center center",
                transition: pinchStartDist.current ? "none" : "transform 0.15s ease",
                cursor: imgScale > 1 ? "grab" : "zoom-in",
                userSelect: "none",
                WebkitUserSelect: "none",
              }}
            />

            {/* Next arrow — only show when not zoomed */}
            {lightboxIdx < lightboxImages.length - 1 && imgScale <= 1 && (
              <button
                onClick={lightboxNext}
                className="absolute right-3 z-10 w-10 h-10 rounded-full bg-white/10 hover:bg-white/25 flex items-center justify-center transition-colors"
              >
                <svg viewBox="0 0 24 24" className="w-6 h-6 text-white" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18l6-6-6-6"/>
                </svg>
              </button>
            )}

            {/* Zoom hint */}
            {imgScale <= 1 && (
              <p className="absolute bottom-2 left-0 right-0 text-center text-white/30 text-xs pointer-events-none">
                Ikki barmoq bilan yoki ikki marta bosib kattalashtiring
              </p>
            )}
          </div>

          {/* Dot indicators */}
          {lightboxImages.length > 1 && imgScale <= 1 && (
            <div className="flex justify-center gap-1.5 py-4 shrink-0">
              {lightboxImages.map((_, i) => (
                <button
                  key={i}
                  onClick={() => { setLightboxIdx(i); resetImgTransform(); }}
                  className={`rounded-full transition-all ${i === lightboxIdx ? "w-5 h-2 bg-white" : "w-2 h-2 bg-white/40"}`}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
