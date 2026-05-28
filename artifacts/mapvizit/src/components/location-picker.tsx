import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useTheme } from "next-themes";

interface LocationPickerProps {
  initialLat?: number;
  initialLng?: number;
  onConfirm: (lat: number, lng: number) => void;
  onCancel: () => void;
}

function createUserLocIcon(heading: number | null = null) {
  const size = heading !== null ? 48 : 22;
  const half = size / 2;
  const svg = heading !== null ? `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="overflow:visible;">
      <g transform="rotate(${heading},${half},${half})">
        <circle cx="${half}" cy="${half}" r="${half-2}" fill="rgba(59,130,246,0.12)" stroke="rgba(59,130,246,0.25)" stroke-width="1"/>
        <polygon points="${half},4 ${half-8},${half+2} ${half},${half-3} ${half+8},${half+2}" fill="#3b82f6" opacity="0.9"/>
      </g>
      <circle cx="${half}" cy="${half}" r="6" fill="#3b82f6" stroke="white" stroke-width="2.5"/>
    </svg>` : `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${half}" cy="${half}" r="${half-1}" fill="rgba(59,130,246,0.25)"/>
      <circle cx="${half}" cy="${half}" r="7" fill="#3b82f6" stroke="white" stroke-width="2.5"/>
    </svg>`;
  return L.divIcon({
    className: "",
    html: `<div style="width:${size}px;height:${size}px">${svg}</div>`,
    iconSize: [size, size],
    iconAnchor: [half, half],
  });
}

function CenterTracker({ onCenterChange }: { onCenterChange: (lat: number, lng: number) => void }) {
  useMapEvents({
    moveend(e) { const c = e.target.getCenter(); onCenterChange(c.lat, c.lng); },
    dragend(e)  { const c = e.target.getCenter(); onCenterChange(c.lat, c.lng); },
  });
  return null;
}

function InvalidateSize() {
  const map = useMap();
  useEffect(() => { setTimeout(() => map.invalidateSize(), 100); }, [map]);
  return null;
}

function FlyTo({ pos }: { pos: [number, number] | null }) {
  const map = useMap();
  const prev = useRef<[number, number] | null>(null);
  useEffect(() => {
    if (pos && pos !== prev.current) {
      prev.current = pos;
      map.flyTo(pos, Math.max(map.getZoom(), 15), { duration: 0.8 });
    }
  }, [pos, map]);
  return null;
}

export function LocationPicker({ initialLat = 41.2995, initialLng = 69.2401, onConfirm, onCancel }: LocationPickerProps) {
  const { theme } = useTheme();
  const [center, setCenter] = useState<[number, number]>([initialLat, initialLng]);
  const [userPos, setUserPos] = useState<[number, number] | null>(null);
  const [userHeading, setUserHeading] = useState<number | null>(null);
  const [flyToPos, setFlyToPos] = useState<[number, number] | null>(null);
  const watchIdRef = useRef<number | null>(null);

  const tileUrl = theme === "dark"
    ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
    : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

  // GPS tracking
  useEffect(() => {
    if (!navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const coords: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        setUserPos(coords);
        if (pos.coords.heading !== null && !isNaN(pos.coords.heading)) {
          setUserHeading(pos.coords.heading);
        }
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 }
    );
    watchIdRef.current = id;
    return () => { if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current); };
  }, []);

  // Device orientation (compass)
  useEffect(() => {
    const handler = (e: DeviceOrientationEvent) => {
      const ios = (e as any).webkitCompassHeading;
      if (typeof ios === "number" && !isNaN(ios)) { setUserHeading(ios); return; }
      if (e.alpha !== null && e.absolute) { setUserHeading((360 - e.alpha) % 360); }
    };
    window.addEventListener("deviceorientationabsolute", handler as EventListener, true);
    window.addEventListener("deviceorientation", handler as EventListener, true);
    return () => {
      window.removeEventListener("deviceorientationabsolute", handler as EventListener, true);
      window.removeEventListener("deviceorientation", handler as EventListener, true);
    };
  }, []);

  const goToMyLocation = () => {
    if (userPos) setFlyToPos([...userPos]);
    else navigator.geolocation?.getCurrentPosition(
      (pos) => {
        const coords: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        setUserPos(coords);
        setFlyToPos(coords);
      },
      () => {},
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  return (
    <div className="flex flex-col h-full">
      <div className="relative flex-1 rounded-xl overflow-hidden border">
        <MapContainer
          center={[initialLat, initialLng]}
          zoom={15}
          zoomControl={true}
          className="w-full h-full"
          style={{ minHeight: 320 }}
        >
          <TileLayer url={tileUrl} />
          <CenterTracker onCenterChange={(lat, lng) => setCenter([lat, lng])} />
          <InvalidateSize />
          <FlyTo pos={flyToPos} />

          {/* User GPS location marker */}
          {userPos && (
            <Marker
              position={userPos}
              icon={createUserLocIcon(userHeading)}
              zIndexOffset={2000}
              interactive={false}
            />
          )}
        </MapContainer>

        {/* Fixed crosshair */}
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-[1000]">
          <div className="absolute w-px h-8 bg-primary top-1/2 left-1/2 -translate-x-1/2 -translate-y-full" />
          <div className="absolute w-px h-8 bg-primary top-1/2 left-1/2 -translate-x-1/2" />
          <div className="absolute h-px w-8 bg-primary top-1/2 left-1/2 -translate-y-1/2 -translate-x-full" />
          <div className="absolute h-px w-8 bg-primary top-1/2 left-1/2 -translate-y-1/2" />
          <div className="absolute w-3 h-3 rounded-full bg-primary border-2 border-background shadow-lg top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
          <div className="absolute w-2 h-1 rounded-full bg-black/20 top-1/2 left-1/2 -translate-x-1/2 translate-y-3" style={{ filter: "blur(2px)" }} />
        </div>

        {/* My location button */}
        <button
          onClick={goToMyLocation}
          className="absolute bottom-3 right-3 z-[1000] w-9 h-9 rounded-xl bg-background/90 backdrop-blur-sm border shadow-md flex items-center justify-center hover:bg-muted transition-colors pointer-events-auto"
          title="Mening joylashuvim"
        >
          <svg viewBox="0 0 24 24" className={`w-5 h-5 ${userPos ? "text-blue-500" : "text-muted-foreground"}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>
            <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" strokeOpacity="0"/>
          </svg>
        </button>
      </div>

      {/* Coords display */}
      <div className="mt-2 px-1 py-1.5 rounded-lg bg-muted text-xs font-mono text-center text-muted-foreground">
        {center[0].toFixed(6)}, {center[1].toFixed(6)}
      </div>

      <p className="text-xs text-muted-foreground text-center mt-1 mb-3">
        Xaritani suring — markaz nuqtacha joylashuv bo'ladi
      </p>

      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 px-4 py-2 rounded-lg border text-sm font-medium hover:bg-muted transition-colors"
        >
          Bekor
        </button>
        <button
          onClick={() => onConfirm(center[0], center[1])}
          className="flex-1 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          Tasdiqlash
        </button>
      </div>
    </div>
  );
}
