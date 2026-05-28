import { useState, useRef, useEffect } from "react";
import {
  useGetMe, useGetUserStats, useListUsers, useUpdateUser, useDeleteUser,
  useListCategories, useCreateCategory, useUpdateCategory, useDeleteCategory,
  useListPoints, useCreatePoint, useUpdatePoint, useDeletePoint,
  useGetSettings, useUpdateSettings, useExportData, useImportData,
  useAssignAdminToPoint, useAddPointContact, useDeletePointContact,
  useDeletePointImage, useGetPointStats,
  getListUsersQueryKey, getListCategoriesQueryKey, getListPointsQueryKey,
  getGetSettingsQueryKey, getGetUserStatsQueryKey, getGetPointStatsQueryKey,
  getExportDataQueryKey,
} from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import {
  Map, Users, Tag, Settings, LayoutDashboard, Plus, Pencil, Trash2,
  MapPin, Save, X, Download, Upload, Phone, Globe, ImageIcon,
  ChevronLeft, Crown, Shield, UserCircle, Star, Menu
} from "lucide-react";
import { SiInstagram, SiTelegram } from "react-icons/si";
import { LocationPicker } from "@/components/location-picker";
import { uploadPointImage } from "@/lib/image-utils";

const ROLE_COLORS: Record<string, string> = {
  sudo: "bg-red-500/20 text-red-400 border-red-500/30",
  admin: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  premium: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  viewer: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
};

const ROLE_LABELS: Record<string, string> = {
  sudo: "Sudo", admin: "Admin", premium: "Premium", viewer: "Oddiy",
};

export default function Sudo() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: user, isError } = useGetMe();
  const { data: stats } = useGetUserStats({ query: { queryKey: getGetUserStatsQueryKey(), enabled: user?.role === "sudo" } });
  const { data: pointStats } = useGetPointStats({ query: { queryKey: getGetPointStatsQueryKey(), enabled: user?.role === "sudo" } });
  const { data: users } = useListUsers({}, { query: { queryKey: getListUsersQueryKey(), enabled: user?.role === "sudo" } });
  const { data: categories } = useListCategories({ query: { queryKey: getListCategoriesQueryKey(), enabled: user?.role === "sudo" } });
  const { data: points } = useListPoints({}, { query: { queryKey: getListPointsQueryKey(), enabled: user?.role === "sudo" } });
  const { data: settings } = useGetSettings({ query: { queryKey: getGetSettingsQueryKey(), enabled: user?.role === "sudo" } });
  const { refetch: doExport } = useExportData({ query: { queryKey: getExportDataQueryKey(), enabled: false } });

  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const deleteCategory = useDeleteCategory();
  const createPoint = useCreatePoint();
  const updatePoint = useUpdatePoint();
  const deletePoint = useDeletePoint();
  const updateSettings = useUpdateSettings();
  const assignAdmin = useAssignAdminToPoint();
  const addContact = useAddPointContact();
  const deleteContact = useDeletePointContact();
  const deleteImage = useDeletePointImage();

  const [activeTab, setActiveTab] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [pointSearch, setPointSearch] = useState("");
  const [uploadingPointId, setUploadingPointId] = useState<number | null>(null);

  // Point modal
  const [pointModal, setPointModal] = useState<{ open: boolean; editing?: any }>({ open: false });
  const [pointForm, setPointForm] = useState({ name: "", description: "", lat: "41.2995", lng: "69.2401", categoryId: "" });
  const [showLocationPicker, setShowLocationPicker] = useState(false);

  // Category modal
  const [catModal, setCatModal] = useState<{ open: boolean; editing?: any }>({ open: false });
  const [catForm, setCatForm] = useState({ name: "", icon: "MapPin", color: "#3b82f6" });

  // Contact modal
  const [contactModal, setContactModal] = useState<{ open: boolean; pointId?: number }>({ open: false });
  const [contactForm, setContactForm] = useState({ type: "phone", value: "", label: "" });

  // Create user modal
  const [userModal, setUserModal] = useState<{ open: boolean; editing?: any }>({ open: false });
  const [userForm, setUserForm] = useState({ name: "", username: "", password: "", phone: "", role: "viewer", isPremium: false, premiumExpiresAt: "" });

  // Settings
  const [premiumEnabled, setPremiumEnabled] = useState(settings?.premiumEnabled ?? false);
  const [botToken, setBotToken] = useState(settings?.botToken ?? "");
  const [backupChatId, setBackupChatId] = useState(settings?.backupChatId ?? "");

  // Google Drive
  interface DriveAccount { id: string; email: string; bytesUsed: number; addedAt: string; isFull: boolean; }
  interface DriveStatus { configured: boolean; enabled: boolean; redirectUri: string; localImagesCount: number; accounts: DriveAccount[]; }
  const [driveStatus, setDriveStatus] = useState<DriveStatus | null>(null);
  const [driveLoading, setDriveLoading] = useState(false);
  const [migrateLoading, setMigrateLoading] = useState(false);
  const [migrateResult, setMigrateResult] = useState<{ total: number; migrated: number; failed: number; errors: string[] } | null>(null);

  // Import
  const [pendingSql, setPendingSql] = useState<string | null>(null);
  const [importLoading, setImportLoading] = useState(false);

  useEffect(() => {
    if (isError) setLocation("/login");
    if (user && user.role !== "sudo") setLocation("/map");
  }, [isError, user, setLocation]);

  useEffect(() => {
    if (settings) {
      setPremiumEnabled(settings.premiumEnabled);
      setBotToken(settings.botToken ?? "");
      setBackupChatId(settings.backupChatId ?? "");
    }
  }, [settings]);

  useEffect(() => {
    if (activeTab === "settings") fetchDriveStatus();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  if (!user || user.role !== "sudo") return null;

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: getListPointsQueryKey() });
    qc.invalidateQueries({ queryKey: getListUsersQueryKey() });
    qc.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
    qc.invalidateQueries({ queryKey: getGetUserStatsQueryKey() });
    qc.invalidateQueries({ queryKey: getGetPointStatsQueryKey() });
  };

  const fetchDriveStatus = async () => {
    setDriveLoading(true);
    try {
      const token = localStorage.getItem("mapvizit_token");
      const r = await fetch("/api/settings/drive/status", { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) setDriveStatus(await r.json());
    } finally { setDriveLoading(false); }
  };

  const openDriveAuth = async () => {
    const token = localStorage.getItem("mapvizit_token");
    const r = await fetch("/api/settings/drive/auth-url", { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) { toast({ title: "Xato", description: "Auth URL olinmadi", variant: "destructive" }); return; }
    const { url } = await r.json();
    const win = window.open(url, "_blank");
    const interval = setInterval(() => {
      if (win?.closed) { clearInterval(interval); fetchDriveStatus(); }
    }, 1000);
  };

  const removeDriveAccount = async (id: string) => {
    const token = localStorage.getItem("mapvizit_token");
    await fetch(`/api/settings/drive/accounts/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    fetchDriveStatus();
  };

  const toggleDriveEnabled = async (enabled: boolean) => {
    const token = localStorage.getItem("mapvizit_token");
    const r = await fetch("/api/settings/drive/enabled", {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    if (r.ok) {
      setDriveStatus(prev => prev ? { ...prev, enabled } : prev);
      toast({ title: enabled ? "Google Drive yoqildi" : "Google Drive o'chirildi" });
    }
  };

  const migrateToDriver = async () => {
    setMigrateLoading(true);
    setMigrateResult(null);
    try {
      const token = localStorage.getItem("mapvizit_token");
      const r = await fetch("/api/settings/drive/migrate", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await r.json();
      if (!r.ok) { toast({ title: "Xato", description: data.error, variant: "destructive" }); return; }
      setMigrateResult(data);
      fetchDriveStatus();
      toast({ title: `Ko'chirildi: ${data.migrated} ta rasm`, description: data.failed > 0 ? `${data.failed} ta xato` : "Hammasi muvaffaqiyatli" });
    } finally {
      setMigrateLoading(false);
    }
  };

  const formatGB = (bytes: number) => (bytes / (1024 ** 3)).toFixed(2) + " GB";
  const drivePercent = (bytes: number) => Math.min(100, (bytes / (15 * 1024 ** 3)) * 100);

  // POINT CRUD
  const openCreatePoint = () => {
    setPointForm({ name: "", description: "", lat: "41.2995", lng: "69.2401", categoryId: "" });
    setPointModal({ open: true });
  };
  const openEditPoint = (p: any) => {
    setPointForm({ name: p.name, description: p.description ?? "", lat: String(p.lat), lng: String(p.lng), categoryId: p.categoryId ? String(p.categoryId) : "" });
    setPointModal({ open: true, editing: p });
  };
  const savePoint = () => {
    const data: any = {
      name: pointForm.name,
      description: pointForm.description || null,
      lat: parseFloat(pointForm.lat),
      lng: parseFloat(pointForm.lng),
      categoryId: pointForm.categoryId ? parseInt(pointForm.categoryId) : null,
    };
    if (pointModal.editing) {
      updatePoint.mutate({ id: pointModal.editing.id, data }, {
        onSuccess: () => { toast({ title: "Nuqta yangilandi" }); setPointModal({ open: false }); invalidateAll(); },
        onError: (e) => toast({ title: "Xato", description: e.message, variant: "destructive" }),
      });
    } else {
      createPoint.mutate({ data }, {
        onSuccess: () => { toast({ title: "Nuqta qo'shildi" }); setPointModal({ open: false }); invalidateAll(); },
        onError: (e) => toast({ title: "Xato", description: e.message, variant: "destructive" }),
      });
    }
  };

  // IMAGE UPLOAD
  const handleImageFileUpload = async (pointId: number, file: File) => {
    setUploadingPointId(pointId);
    try {
      await uploadPointImage(pointId, file);
      toast({ title: "Rasm qo'shildi (WebP formatida)" });
      qc.invalidateQueries({ queryKey: getListPointsQueryKey() });
    } catch (e: any) {
      toast({ title: "Rasm xatosi", description: e.message, variant: "destructive" });
    } finally {
      setUploadingPointId(null);
    }
  };

  // CATEGORY CRUD
  const openCreateCat = () => { setCatForm({ name: "", icon: "MapPin", color: "#3b82f6" }); setCatModal({ open: true }); };
  const openEditCat = (c: any) => { setCatForm({ name: c.name, icon: c.icon, color: c.color }); setCatModal({ open: true, editing: c }); };
  const saveCat = () => {
    if (catModal.editing) {
      updateCategory.mutate({ id: catModal.editing.id, data: catForm }, {
        onSuccess: () => { toast({ title: "Yangilandi" }); setCatModal({ open: false }); qc.invalidateQueries({ queryKey: getListCategoriesQueryKey() }); },
        onError: (e) => toast({ title: "Xato", description: e.message, variant: "destructive" }),
      });
    } else {
      createCategory.mutate({ data: catForm }, {
        onSuccess: () => { toast({ title: "Qo'shildi" }); setCatModal({ open: false }); qc.invalidateQueries({ queryKey: getListCategoriesQueryKey() }); },
        onError: (e) => toast({ title: "Xato", description: e.message, variant: "destructive" }),
      });
    }
  };

  // CONTACT
  const saveContact = () => {
    if (!contactModal.pointId) return;
    addContact.mutate({ id: contactModal.pointId, data: { type: contactForm.type as any, value: contactForm.value, label: contactForm.label || null } }, {
      onSuccess: () => { toast({ title: "Kontakt qo'shildi" }); setContactModal({ open: false }); setContactForm({ type: "phone", value: "", label: "" }); qc.invalidateQueries({ queryKey: getListPointsQueryKey() }); },
      onError: (e) => toast({ title: "Xato", description: e.message, variant: "destructive" }),
    });
  };

  // USER CRUD
  const openCreateUser = () => {
    setUserForm({ name: "", username: "", password: "", phone: "", role: "viewer", isPremium: false, premiumExpiresAt: "" });
    setUserModal({ open: true });
  };
  const openEditUser = (u: any) => {
    setUserForm({
      name: u.name,
      username: u.username,
      password: "",
      phone: u.phone ?? "",
      role: u.role,
      isPremium: u.isPremium,
      premiumExpiresAt: u.premiumExpiresAt ? new Date(u.premiumExpiresAt).toISOString().split("T")[0] : "",
    });
    setUserModal({ open: true, editing: u });
  };
  const saveUser = async () => {
    if (userModal.editing) {
      const data: any = {
        name: userForm.name,
        phone: userForm.phone || null,
        role: userForm.role as any,
        isPremium: userForm.isPremium || userForm.role === "premium",
        premiumExpiresAt: userForm.premiumExpiresAt || null,
      };
      updateUser.mutate({ id: userModal.editing.id, data }, {
        onSuccess: () => { toast({ title: "Yangilandi" }); setUserModal({ open: false }); invalidateAll(); },
        onError: (e) => toast({ title: "Xato", description: e.message, variant: "destructive" }),
      });
    } else {
      // Create new user
      const token = localStorage.getItem("mapvizit_token");
      try {
        const res = await fetch("/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            username: userForm.username,
            name: userForm.name,
            password: userForm.password,
            phone: userForm.phone || null,
            role: userForm.role,
            isPremium: userForm.isPremium || userForm.role === "premium",
            premiumExpiresAt: userForm.premiumExpiresAt || null,
          }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Xato");
        }
        toast({ title: "Foydalanuvchi yaratildi" });
        setUserModal({ open: false });
        invalidateAll();
      } catch (e: any) {
        toast({ title: "Xato", description: e.message, variant: "destructive" });
      }
    }
  };

  // SETTINGS
  const saveSettings = () => {
    updateSettings.mutate({ data: { premiumEnabled, botToken: botToken || null, backupChatId: backupChatId || null } }, {
      onSuccess: () => { toast({ title: "Sozlamalar saqlandi" }); qc.invalidateQueries({ queryKey: getGetSettingsQueryKey() }); },
      onError: (e) => toast({ title: "Xato", description: e.message, variant: "destructive" }),
    });
  };

  const handleExport = async () => {
    try {
      const token = localStorage.getItem("mapvizit_token");
      const res = await fetch("/api/settings/export", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Export xatosi");
      const sql = await res.text();
      const blob = new Blob([sql], { type: "application/sql" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `mapvizit-backup-${new Date().toISOString().split("T")[0]}.sql`;
      a.click(); URL.revokeObjectURL(url);
      toast({ title: "SQL backup yuklandi" });
    } catch (e: any) {
      toast({ title: "Export xatosi", description: e.message, variant: "destructive" });
    }
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setPendingSql(ev.target?.result as string);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const confirmImport = async () => {
    if (!pendingSql) return;
    setImportLoading(true);
    try {
      const token = localStorage.getItem("mapvizit_token");
      const res = await fetch("/api/settings/import-sql", {
        method: "POST",
        headers: { "Content-Type": "text/plain", Authorization: `Bearer ${token}` },
        body: pendingSql,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Import xatosi");
      toast({ title: "SQL import muvaffaqiyatli" });
      invalidateAll();
    } catch (err: any) {
      toast({ title: "Import xatosi", description: err.message, variant: "destructive" });
    } finally {
      setImportLoading(false);
      setPendingSql(null);
    }
  };

  const filteredUsers = users?.filter(u =>
    !userSearch || u.name.toLowerCase().includes(userSearch.toLowerCase()) ||
    u.username.toLowerCase().includes(userSearch.toLowerCase())
  ) ?? [];

  const filteredPoints = points?.filter(p =>
    !pointSearch || p.name.toLowerCase().includes(pointSearch.toLowerCase())
  ) ?? [];

  const chartColors = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#f97316", "#ec4899"];

  const navItems = [
    { id: "dashboard", icon: LayoutDashboard, label: "Dashboard" },
    { id: "points", icon: Map, label: "Nuqtalar" },
    { id: "categories", icon: Tag, label: "Kategoriyalar" },
    { id: "users", icon: Users, label: "Foydalanuvchilar" },
    { id: "settings", icon: Settings, label: "Sozlamalar" },
  ];

  const goToTab = (id: string) => { setActiveTab(id); setSidebarOpen(false); };

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      {/* Mobile top bar */}
      <div className="md:hidden flex items-center justify-between px-4 py-3 border-b bg-card">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
            <MapPin className="w-3.5 h-3.5 text-primary-foreground" />
          </div>
          <span className="font-bold">MapVizit — {navItems.find(n => n.id === activeTab)?.label}</span>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/map")} className="h-9 w-9">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(o => !o)} className="h-9 w-9">
            <Menu className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Sidebar */}
      <div className={`
        fixed inset-0 z-50 md:static md:z-auto md:flex md:flex-col
        w-60 border-r bg-card shrink-0
        transition-transform duration-200
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
      `}>
        {/* Overlay for mobile */}
        <div className="fixed inset-0 bg-black/50 md:hidden -z-10" onClick={() => setSidebarOpen(false)} />

        <div className="p-4 border-b hidden md:flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <MapPin className="w-4 h-4 text-primary-foreground" />
          </div>
          <div>
            <div className="font-bold text-sm">MapVizit</div>
            <div className="text-xs text-muted-foreground">Sudo Panel</div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map(({ id, icon: Icon, label }) => (
            <button key={id} onClick={() => goToTab(id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeTab === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
            >
              <Icon className="w-4 h-4 shrink-0" /> {label}
            </button>
          ))}
        </nav>

        <div className="p-3 border-t">
          <button onClick={() => setLocation("/map")}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
            <ChevronLeft className="w-4 h-4" /> Xaritaga qaytish
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto">

        {/* DASHBOARD */}
        {activeTab === "dashboard" && (
          <div className="p-4 md:p-6 space-y-6">
            <h1 className="text-2xl font-bold">Dashboard</h1>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { label: "Foydalanuvchilar", value: stats?.total ?? 0, icon: Users, color: "text-blue-400" },
                { label: "Adminlar", value: stats?.admins ?? 0, icon: Shield, color: "text-green-400" },
                { label: "Premium", value: stats?.premium ?? 0, icon: Crown, color: "text-yellow-400" },
                { label: "Nuqtalar", value: pointStats?.total ?? 0, icon: MapPin, color: "text-red-400" },
              ].map((s, i) => (
                <Card key={i}>
                  <CardContent className="pt-5 pb-4">
                    <s.icon className={`w-5 h-5 ${s.color} mb-2`} />
                    <div className="text-3xl font-bold">{s.value}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
                  </CardContent>
                </Card>
              ))}
            </div>
            {pointStats && pointStats.byCategory.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-base">Kategoriyalar bo'yicha nuqtalar</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={pointStats.byCategory}>
                      <XAxis dataKey="categoryName" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                        {pointStats.byCategory.map((_, idx) => (
                          <Cell key={idx} fill={chartColors[idx % chartColors.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* POINTS */}
        {activeTab === "points" && (
          <div className="p-4 md:p-6 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h1 className="text-xl md:text-2xl font-bold">Nuqtalar ({filteredPoints.length})</h1>
              <Button onClick={openCreatePoint} size="sm">
                <Plus className="w-4 h-4 mr-1.5" /> Qo'shish
              </Button>
            </div>
            <Input placeholder="Qidirish..." value={pointSearch} onChange={(e) => setPointSearch(e.target.value)} className="max-w-sm" />

            <div className="space-y-3">
              {filteredPoints.map((point) => (
                <Card key={point.id} className="overflow-hidden">
                  <CardContent className="p-3 md:p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold truncate">{point.name}</h3>
                          {point.category && (
                            <span className="text-xs px-2 py-0.5 rounded-full border shrink-0" style={{ color: point.category.color, borderColor: point.category.color + "40", backgroundColor: point.category.color + "15" }}>
                              {point.category.name}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          <span className="font-mono text-primary">/vizitka/{point.vizitkaCode}</span>
                          {" · "}{point.lat.toFixed(4)}, {point.lng.toFixed(4)}
                        </p>
                        {point.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{point.description}</p>}

                        {/* Contacts */}
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {point.contacts?.map((c: any) => (
                            <div key={c.id} className="flex items-center gap-1 text-xs bg-muted px-2 py-0.5 rounded-full">
                              {c.type === "phone" && <Phone className="w-3 h-3" />}
                              {c.type === "telegram" && <SiTelegram className="w-3 h-3" />}
                              {c.type === "instagram" && <SiInstagram className="w-3 h-3" />}
                              {c.type === "website" && <Globe className="w-3 h-3" />}
                              <span className="truncate max-w-[80px]">{c.label || c.value}</span>
                              <button onClick={() => deleteContact.mutate({ id: point.id, contactId: c.id }, { onSuccess: () => qc.invalidateQueries({ queryKey: getListPointsQueryKey() }) })} className="text-muted-foreground hover:text-destructive ml-0.5">
                                <X className="w-2.5 h-2.5" />
                              </button>
                            </div>
                          ))}
                          <button onClick={() => { setContactModal({ open: true, pointId: point.id }); setContactForm({ type: "phone", value: "", label: "" }); }}
                            className="text-xs px-2 py-0.5 rounded-full border border-dashed hover:bg-muted transition-colors flex items-center gap-1">
                            <Plus className="w-2.5 h-2.5" /> Kontakt
                          </button>
                        </div>

                        {/* Images */}
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {point.images?.map((img: any) => (
                            <div key={img.id} className="relative group w-10 h-10 rounded overflow-hidden border">
                              <img src={img.url} alt="" className="w-full h-full object-cover" />
                              <button onClick={() => deleteImage.mutate({ id: point.id, imageId: img.id }, { onSuccess: () => qc.invalidateQueries({ queryKey: getListPointsQueryKey() }) })}
                                className="absolute inset-0 bg-black/60 hidden group-hover:flex items-center justify-center text-white">
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                          <label className={`w-10 h-10 rounded border border-dashed flex items-center justify-center hover:bg-muted transition-colors cursor-pointer ${uploadingPointId === point.id ? "opacity-50" : ""}`}>
                            {uploadingPointId === point.id
                              ? <div className="w-3 h-3 border border-primary border-t-transparent rounded-full animate-spin" />
                              : <ImageIcon className="w-4 h-4 text-muted-foreground" />
                            }
                            <input type="file" accept="image/*" className="hidden" disabled={uploadingPointId !== null}
                              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageFileUpload(point.id, f); e.target.value = ""; }} />
                          </label>
                        </div>

                        {/* Admin assignment */}
                        <div className="mt-2">
                          <Select
                            value={point.adminId ? String(point.adminId) : "none"}
                            onValueChange={(v) => {
                              assignAdmin.mutate({ id: point.id, data: { adminId: v === "none" ? null : parseInt(v) } }, {
                                onSuccess: () => { toast({ title: "Admin biriktirildi" }); qc.invalidateQueries({ queryKey: getListPointsQueryKey() }); qc.invalidateQueries({ queryKey: getListUsersQueryKey() }); },
                              });
                            }}
                          >
                            <SelectTrigger className="h-7 text-xs w-44">
                              <SelectValue placeholder="Admin biriktirish..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Admin yo'q</SelectItem>
                              {users?.filter(u => u.role === "admin" || u.role === "viewer").map(u => (
                                <SelectItem key={u.id} value={String(u.id)}>{u.name} (@{u.username})</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="flex flex-col gap-1.5 shrink-0">
                        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => openEditPoint(point)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="outline" size="icon" className="h-8 w-8 text-destructive hover:text-destructive">
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Nuqtani o'chirish</AlertDialogTitle>
                              <AlertDialogDescription>"{point.name}" o'chiriladi. Bu amalni qaytarib bo'lmaydi.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Bekor qilish</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deletePoint.mutate({ id: point.id }, { onSuccess: () => { toast({ title: "O'chirildi" }); invalidateAll(); } })}>O'chirish</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {filteredPoints.length === 0 && (
                <div className="text-center py-16 text-muted-foreground">
                  <MapPin className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p>Nuqtalar yo'q</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* CATEGORIES */}
        {activeTab === "categories" && (
          <div className="p-4 md:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h1 className="text-xl md:text-2xl font-bold">Kategoriyalar</h1>
              <Button onClick={openCreateCat} size="sm"><Plus className="w-4 h-4 mr-1.5" /> Qo'shish</Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {categories?.map((cat) => (
                <Card key={cat.id}>
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: cat.color + "25" }}>
                        <div className="w-4 h-4 rounded-full" style={{ backgroundColor: cat.color }} />
                      </div>
                      <div>
                        <div className="font-semibold">{cat.name}</div>
                        <div className="text-xs text-muted-foreground">{(cat as any).pointCount ?? 0} ta nuqta</div>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditCat(cat)}><Pencil className="w-3.5 h-3.5" /></Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader><AlertDialogTitle>O'chirish</AlertDialogTitle><AlertDialogDescription>"{cat.name}" kategoriyasini o'chirish</AlertDialogDescription></AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Bekor</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteCategory.mutate({ id: cat.id }, { onSuccess: () => { toast({ title: "O'chirildi" }); qc.invalidateQueries({ queryKey: getListCategoriesQueryKey() }); } })}>O'chirish</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* USERS */}
        {activeTab === "users" && (
          <div className="p-4 md:p-6 space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h1 className="text-xl md:text-2xl font-bold">Foydalanuvchilar ({filteredUsers.length})</h1>
              <div className="flex gap-2">
                <Input placeholder="Qidirish..." value={userSearch} onChange={(e) => setUserSearch(e.target.value)} className="w-40 md:w-52" />
                <Button size="sm" onClick={openCreateUser}><Plus className="w-4 h-4 mr-1.5" /> Yaratish</Button>
              </div>
            </div>

            <Tabs defaultValue="all">
              <TabsList className="w-full md:w-auto">
                <TabsTrigger value="all" className="flex-1 md:flex-none">Barchasi</TabsTrigger>
                <TabsTrigger value="admin" className="flex-1 md:flex-none">Adminlar</TabsTrigger>
                <TabsTrigger value="premium" className="flex-1 md:flex-none">Premium</TabsTrigger>
                <TabsTrigger value="viewer" className="flex-1 md:flex-none">Oddiy</TabsTrigger>
              </TabsList>
              {["all", "admin", "premium", "viewer"].map(roleFilter => (
                <TabsContent key={roleFilter} value={roleFilter} className="space-y-2 mt-4">
                  {filteredUsers
                    .filter(u => roleFilter === "all" || u.role === roleFilter)
                    .map((u) => (
                      <Card key={u.id}>
                        <CardContent className="p-3 md:p-4 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 md:w-10 md:h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                              <UserCircle className="w-5 h-5 text-muted-foreground" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-sm truncate max-w-[120px] md:max-w-none">{u.name}</span>
                                <span className={`text-xs px-2 py-0.5 rounded-full border font-medium shrink-0 ${ROLE_COLORS[u.role]}`}>{ROLE_LABELS[u.role]}</span>
                                {u.isPremium && <Crown className="w-3.5 h-3.5 text-yellow-400 shrink-0" />}
                              </div>
                              <p className="text-xs text-muted-foreground">@{u.username}{u.phone && ` · ${u.phone}`}</p>
                              {u.premiumExpiresAt && <p className="text-xs text-yellow-400">→ {new Date(u.premiumExpiresAt).toLocaleDateString("uz-UZ")}</p>}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditUser(u)}>
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            {u.role !== "sudo" && (
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader><AlertDialogTitle>O'chirish</AlertDialogTitle><AlertDialogDescription>"{u.name}" foydalanuvchisini o'chirish</AlertDialogDescription></AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Bekor</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => deleteUser.mutate({ id: u.id }, { onSuccess: () => { toast({ title: "O'chirildi" }); qc.invalidateQueries({ queryKey: getListUsersQueryKey() }); qc.invalidateQueries({ queryKey: getGetUserStatsQueryKey() }); } })}>O'chirish</AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  {filteredUsers.filter(u => roleFilter === "all" || u.role === roleFilter).length === 0 && (
                    <div className="text-center py-8 text-muted-foreground text-sm">Foydalanuvchilar yo'q</div>
                  )}
                </TabsContent>
              ))}
            </Tabs>
          </div>
        )}

        {/* SETTINGS */}
        {activeTab === "settings" && (
          <div className="p-4 md:p-6 max-w-2xl space-y-6">
            <h1 className="text-xl md:text-2xl font-bold">Sozlamalar</h1>
            <Card>
              <CardHeader><CardTitle className="text-base">Premium tizimi</CardTitle><CardDescription>Yoqilsa premium foydalanuvchilar kontaktlarni ko'ra oladi.</CardDescription></CardHeader>
              <CardContent>
                <div className="flex items-center gap-3">
                  <Switch
                    checked={premiumEnabled}
                    onCheckedChange={(val) => {
                      setPremiumEnabled(val);
                      updateSettings.mutate(
                        { data: { premiumEnabled: val, botToken: botToken || null, backupChatId: backupChatId || null } },
                        {
                          onSuccess: () => {
                            toast({ title: val ? "Premium yoqildi" : "Premium o'chirildi" });
                            qc.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
                          },
                          onError: (e) => toast({ title: "Xato", description: e.message, variant: "destructive" }),
                        }
                      );
                    }}
                  />
                  <Label>{premiumEnabled ? "Yoqiq — Premium talab qilinadi" : "O'chiq — Hammaga bepul"}</Label>
                  {updateSettings.isPending && <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Telegram Backup Bot</CardTitle><CardDescription>Har daqiqada JSON zaxira yuboriladi.</CardDescription></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2"><Label>Bot Token</Label><Input value={botToken} onChange={(e) => setBotToken(e.target.value)} placeholder="123456:ABCdef..." /></div>
                <div className="space-y-2"><Label>Backup Chat ID</Label><Input value={backupChatId} onChange={(e) => setBackupChatId(e.target.value)} placeholder="-100123456789" /></div>
              </CardContent>
            </Card>
            <Button onClick={saveSettings} disabled={updateSettings.isPending}>
              <Save className="w-4 h-4 mr-2" />{updateSettings.isPending ? "Saqlanmoqda..." : "Saqlash"}
            </Button>

            {/* Google Drive */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-blue-400" />
                  Google Drive — Rasm xotirasi
                </CardTitle>
                <CardDescription>
                  Drive yoqilmagan bo'lsa rasmlar serverga saqlanadi. Yoqilganda Drive'ga yuklaydi. Xohlagan vaqt migrate qilish mumkin.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {driveLoading && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    Yuklanmoqda...
                  </div>
                )}

                {driveStatus && !driveStatus.configured && (
                  <div className="rounded-md bg-yellow-500/10 border border-yellow-500/30 p-3 text-sm space-y-2">
                    <p className="font-medium text-yellow-400">⚠️ GOOGLE_CLIENT_ID va GOOGLE_CLIENT_SECRET o'rnatilmagan</p>
                    <p className="text-muted-foreground">Server .env fayliga yoki Secrets'ga qo'shing.</p>
                    <p className="text-xs text-muted-foreground">Redirect URI: <code className="bg-muted px-1 py-0.5 rounded text-xs">{driveStatus.redirectUri}</code></p>
                  </div>
                )}

                {driveStatus?.configured && (
                  <>
                    {/* Yoqish/O'chirish toggle */}
                    <div className="flex items-center justify-between rounded-md border border-border p-3">
                      <div>
                        <p className="text-sm font-medium">Google Drive</p>
                        <p className="text-xs text-muted-foreground">
                          {driveStatus.enabled
                            ? "Yangi rasmlar Drive'ga yuklanadi"
                            : "Yangi rasmlar serverga saqlanadi (uploads/)"}
                        </p>
                      </div>
                      <Switch
                        checked={driveStatus.enabled}
                        disabled={driveStatus.accounts.length === 0}
                        onCheckedChange={toggleDriveEnabled}
                      />
                    </div>

                    {driveStatus.accounts.length === 0 && (
                      <p className="text-xs text-muted-foreground">Avval akkaunt qo'shing, keyin yoqish mumkin.</p>
                    )}

                    <div className="text-xs text-muted-foreground">
                      Redirect URI:<br />
                      <code className="bg-muted px-1 py-0.5 rounded break-all">{driveStatus.redirectUri}</code>
                    </div>

                    {/* Akkauntlar */}
                    {driveStatus.accounts.map((acc, i) => (
                      <div key={acc.id} className="rounded-md border border-border p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium">{i + 1}. {acc.email}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatGB(acc.bytesUsed)} / 15 GB
                              {acc.isFull && <span className="text-red-400 font-medium ml-1">— To'ldi</span>}
                            </p>
                          </div>
                          <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => removeDriveAccount(acc.id)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                        <div className="w-full bg-muted rounded-full h-1.5">
                          <div
                            className={`h-1.5 rounded-full transition-all ${acc.isFull ? "bg-red-500" : "bg-blue-500"}`}
                            style={{ width: `${drivePercent(acc.bytesUsed)}%` }}
                          />
                        </div>
                      </div>
                    ))}

                    <Button variant="outline" onClick={openDriveAuth} className="w-full">
                      <Plus className="w-4 h-4 mr-2" />
                      Yangi Google akkaunt qo'shish
                    </Button>

                    {/* Migrate bo'limi */}
                    {driveStatus.enabled && (
                      <div className="rounded-md bg-blue-500/10 border border-blue-500/20 p-3 space-y-3">
                        <div>
                          <p className="text-sm font-medium text-blue-400">Rasmlarni Drive'ga ko'chirish</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Serverda saqlangan rasmlar: <span className="font-medium text-foreground">{driveStatus.localImagesCount} ta fayl</span>
                            {" · "}DB dagi local URL lar Drive'ga ko'chiriladi
                          </p>
                        </div>
                        <Button
                          size="sm"
                          onClick={migrateToDriver}
                          disabled={migrateLoading || driveStatus.localImagesCount === 0}
                          className="w-full"
                        >
                          {migrateLoading
                            ? <><div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />Ko'chirilmoqda...</>
                            : <><Upload className="w-4 h-4 mr-2" />Barcha rasmlarni Drive'ga ko'chirish</>
                          }
                        </Button>
                        {migrateResult && (
                          <div className={`rounded text-xs p-2 ${migrateResult.failed > 0 ? "bg-yellow-500/10 text-yellow-400" : "bg-green-500/10 text-green-400"}`}>
                            Jami: {migrateResult.total} · Ko'chirildi: {migrateResult.migrated} · Xato: {migrateResult.failed}
                            {migrateResult.errors.length > 0 && (
                              <ul className="mt-1 space-y-0.5 text-muted-foreground">
                                {migrateResult.errors.map((e, i) => <li key={i}>• {e}</li>)}
                              </ul>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    <Button size="sm" variant="ghost" className="text-xs text-muted-foreground" onClick={fetchDriveStatus}>
                      Yangilash
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Eksport / Import</CardTitle></CardHeader>
              <CardContent className="flex gap-3 flex-wrap">
                <Button variant="outline" onClick={handleExport}><Download className="w-4 h-4 mr-2" /> Eksport (.sql)</Button>
                <label>
                  <Button variant="outline" asChild><span><Upload className="w-4 h-4 mr-2" /> Import (.sql)</span></Button>
                  <input type="file" accept=".sql" className="hidden" onChange={handleImport} />
                </label>

                {/* Import tasdiqlash dialogi */}
                <AlertDialog open={!!pendingSql} onOpenChange={(o) => { if (!o) setPendingSql(null); }}>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Importni tasdiqlang</AlertDialogTitle>
                      <AlertDialogDescription className="space-y-2">
                        <span className="block">SQL fayl import qilinadi. Buning natijasida:</span>
                        <span className="block font-medium text-destructive">⚠️ Barcha mavjud ma'lumotlar (foydalanuvchilar, nuqtalar, kategoriyalar, kontaktlar) o'chiriladi va SQL faylidagi ma'lumotlar bilan almashtiriladi.</span>
                        <span className="block font-semibold">Bu amalni qaytarib bo'lmaydi. Davom etasizmi?</span>
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Bekor qilish</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive hover:bg-destructive/90"
                        onClick={confirmImport}
                        disabled={importLoading}
                      >
                        {importLoading
                          ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />Yuklanmoqda...</>
                          : "Ha, import qilish"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* POINT MODAL */}
      <Dialog open={pointModal.open} onOpenChange={(o) => { if (!o) setShowLocationPicker(false); setPointModal({ open: o }); }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{pointModal.editing ? "Nuqtani tahrirlash" : "Yangi nuqta"}</DialogTitle>
          </DialogHeader>

          {showLocationPicker ? (
            <div className="h-96">
              <LocationPicker
                initialLat={parseFloat(pointForm.lat) || 41.2995}
                initialLng={parseFloat(pointForm.lng) || 69.2401}
                onConfirm={(lat, lng) => {
                  setPointForm(f => ({ ...f, lat: lat.toFixed(6), lng: lng.toFixed(6) }));
                  setShowLocationPicker(false);
                }}
                onCancel={() => setShowLocationPicker(false)}
              />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Nomi *</Label>
                <Input value={pointForm.name} onChange={(e) => setPointForm(f => ({ ...f, name: e.target.value }))} placeholder="Nuqta nomi" />
              </div>
              <div className="space-y-2">
                <Label>Tavsif</Label>
                <Textarea value={pointForm.description} onChange={(e) => setPointForm(f => ({ ...f, description: e.target.value }))} rows={2} />
              </div>
              <div className="space-y-2">
                <Label>Joylashuv</Label>
                <div className="flex gap-2">
                  <div className="flex-1 p-2 rounded-lg border bg-muted text-xs font-mono">
                    {parseFloat(pointForm.lat).toFixed(4)}, {parseFloat(pointForm.lng).toFixed(4)}
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={() => setShowLocationPicker(true)}>
                    <MapPin className="w-4 h-4 mr-1.5" /> Xaritada tanla
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Kategoriya</Label>
                <Select value={pointForm.categoryId || "none"} onValueChange={(v) => setPointForm(f => ({ ...f, categoryId: v === "none" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="Tanlang..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Kategoriyasiz</SelectItem>
                    {categories?.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setPointModal({ open: false })}>Bekor</Button>
                <Button onClick={savePoint} disabled={!pointForm.name || createPoint.isPending || updatePoint.isPending}>
                  <Save className="w-4 h-4 mr-2" /> Saqlash
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* CATEGORY MODAL */}
      <Dialog open={catModal.open} onOpenChange={(o) => setCatModal({ open: o })}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{catModal.editing ? "Tahrirlash" : "Yangi kategoriya"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Nomi *</Label><Input value={catForm.name} onChange={(e) => setCatForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Rang</Label>
              <div className="flex gap-2 items-center">
                <input type="color" value={catForm.color} onChange={(e) => setCatForm(f => ({ ...f, color: e.target.value }))} className="w-10 h-10 rounded cursor-pointer border" />
                <Input value={catForm.color} onChange={(e) => setCatForm(f => ({ ...f, color: e.target.value }))} className="font-mono" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCatModal({ open: false })}>Bekor</Button>
            <Button onClick={saveCat} disabled={!catForm.name}><Save className="w-4 h-4 mr-2" /> Saqlash</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CONTACT MODAL */}
      <Dialog open={contactModal.open} onOpenChange={(o) => setContactModal({ open: o })}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Kontakt qo'shish</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Tur</Label>
              <Select value={contactForm.type} onValueChange={(v) => setContactForm(f => ({ ...f, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="phone">Telefon</SelectItem>
                  <SelectItem value="telegram">Telegram</SelectItem>
                  <SelectItem value="instagram">Instagram</SelectItem>
                  <SelectItem value="website">Veb-sayt</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Qiymat *</Label>
              <Input value={contactForm.value} onChange={(e) => setContactForm(f => ({ ...f, value: e.target.value }))}
                placeholder={contactForm.type === "phone" ? "+998..." : contactForm.type === "telegram" ? "@username" : contactForm.type === "instagram" ? "@username" : "https://..."} />
            </div>
            <div className="space-y-2"><Label>Yorliq (ixtiyoriy)</Label>
              <Input value={contactForm.label} onChange={(e) => setContactForm(f => ({ ...f, label: e.target.value }))} placeholder="Asosiy, Navbatchi..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setContactModal({ open: false })}>Bekor</Button>
            <Button onClick={saveContact} disabled={!contactForm.value || addContact.isPending}><Plus className="w-4 h-4 mr-2" /> Qo'shish</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* USER MODAL */}
      <Dialog open={userModal.open} onOpenChange={(o) => setUserModal({ open: o })}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{userModal.editing ? `Tahrirlash: ${userModal.editing.name}` : "Yangi foydalanuvchi"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2 col-span-2"><Label>To'liq ism *</Label>
                <Input value={userForm.name} onChange={(e) => setUserForm(f => ({ ...f, name: e.target.value }))} placeholder="Ism Familiya" />
              </div>
              {!userModal.editing && (
                <div className="space-y-2 col-span-2"><Label>Login (username) *</Label>
                  <Input value={userForm.username} onChange={(e) => setUserForm(f => ({ ...f, username: e.target.value }))} placeholder="username" />
                </div>
              )}
              {!userModal.editing && (
                <div className="space-y-2 col-span-2"><Label>Parol *</Label>
                  <Input type="password" value={userForm.password} onChange={(e) => setUserForm(f => ({ ...f, password: e.target.value }))} placeholder="Kamida 4 ta belgi" />
                </div>
              )}
              <div className="space-y-2 col-span-2"><Label>Telefon (ixtiyoriy)</Label>
                <Input value={userForm.phone} onChange={(e) => setUserForm(f => ({ ...f, phone: e.target.value }))} placeholder="+998901234567" />
              </div>
              <div className="space-y-2"><Label>Rol</Label>
                <Select value={userForm.role} onValueChange={(v) => setUserForm(f => ({ ...f, role: v, isPremium: v === "premium" ? true : f.isPremium }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="viewer">Oddiy</SelectItem>
                    <SelectItem value="premium">Premium</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="sudo">Sudo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Premium holati</Label>
                <div className="flex items-center gap-2 pt-2">
                  <Switch checked={userForm.isPremium || userForm.role === "premium"} onCheckedChange={(v) => setUserForm(f => ({ ...f, isPremium: v }))} />
                  <Label className="text-sm">{userForm.isPremium || userForm.role === "premium" ? "Premium" : "Oddiy"}</Label>
                </div>
              </div>
              {(userForm.isPremium || userForm.role === "premium") && (
                <div className="space-y-2 col-span-2">
                  <Label>Premium muddati (ixtiyoriy)</Label>
                  <Input type="date" value={userForm.premiumExpiresAt} onChange={(e) => setUserForm(f => ({ ...f, premiumExpiresAt: e.target.value }))} />
                  <p className="text-xs text-muted-foreground">Bo'sh qoldirilsa — cheklovsiz premium.</p>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUserModal({ open: false })}>Bekor</Button>
            <Button onClick={saveUser} disabled={!userForm.name || (!userModal.editing && (!userForm.username || !userForm.password))}>
              <Save className="w-4 h-4 mr-2" /> {userModal.editing ? "Saqlash" : "Yaratish"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
