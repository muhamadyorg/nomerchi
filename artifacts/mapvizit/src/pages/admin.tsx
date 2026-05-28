import { useState } from "react";
import { useGetMe, useGetPoint, useUpdatePoint, useAddPointContact, useDeletePointContact,
  useAddPointImage, useDeletePointImage, useListCategories,
  getGetPointQueryKey, getListCategoriesQueryKey
} from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { MapPin, ChevronLeft, Save, Plus, Trash2, Phone, Globe, ImageIcon, ExternalLink, X } from "lucide-react";
import { SiTelegram, SiInstagram } from "react-icons/si";

const CONTACT_TYPE_LABELS: Record<string, string> = {
  phone: "Telefon",
  telegram: "Telegram",
  instagram: "Instagram",
  website: "Veb-sayt",
};

export default function Admin() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: user, isError } = useGetMe();
  const { data: point, isLoading } = useGetPoint(user?.assignedPointId ?? 0, {
    query: { enabled: !!user?.assignedPointId, queryKey: getGetPointQueryKey(user?.assignedPointId ?? 0) }
  });
  const { data: categories } = useListCategories({ query: { queryKey: getListCategoriesQueryKey(), enabled: !!user } });

  const updatePoint = useUpdatePoint();
  const addContact = useAddPointContact();
  const deleteContact = useDeletePointContact();
  const addImage = useAddPointImage();
  const deleteImage = useDeletePointImage();

  const [form, setForm] = useState({ name: "", description: "", categoryId: "" });
  const [contactModal, setContactModal] = useState(false);
  const [contactForm, setContactForm] = useState({ type: "phone", value: "", label: "" });
  const [imageModal, setImageModal] = useState(false);
  const [imageUrl, setImageUrl] = useState("");

  useEffect(() => {
    if (isError) setLocation("/login");
    if (user && user.role !== "admin" && user.role !== "sudo") setLocation("/map");
  }, [isError, user, setLocation]);

  useEffect(() => {
    if (point) {
      setForm({
        name: point.name,
        description: point.description ?? "",
        categoryId: point.categoryId ? String(point.categoryId) : "",
      });
    }
  }, [point]);

  if (!user || (user.role !== "admin" && user.role !== "sudo")) return null;

  const invalidate = () => {
    if (user.assignedPointId) {
      qc.invalidateQueries({ queryKey: getGetPointQueryKey(user.assignedPointId) });
    }
  };

  const handleSave = () => {
    if (!point) return;
    updatePoint.mutate({
      id: point.id,
      data: {
        name: form.name,
        description: form.description || null,
        categoryId: form.categoryId ? parseInt(form.categoryId) : null,
      }
    }, {
      onSuccess: () => { toast({ title: "Saqlandi" }); invalidate(); },
      onError: (e) => toast({ title: "Xato", description: e.message, variant: "destructive" }),
    });
  };

  const handleAddContact = () => {
    if (!point) return;
    addContact.mutate({ id: point.id, data: { type: contactForm.type as any, value: contactForm.value, label: contactForm.label || null } }, {
      onSuccess: () => { toast({ title: "Kontakt qo'shildi" }); setContactModal(false); setContactForm({ type: "phone", value: "", label: "" }); invalidate(); },
      onError: (e) => toast({ title: "Xato", description: e.message, variant: "destructive" }),
    });
  };

  const handleAddImage = () => {
    if (!point) return;
    addImage.mutate({ id: point.id, data: { url: imageUrl, caption: null } }, {
      onSuccess: () => { toast({ title: "Rasm qo'shildi" }); setImageModal(false); setImageUrl(""); invalidate(); },
      onError: (e) => toast({ title: "Xato", description: e.message, variant: "destructive" }),
    });
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/map")}>
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">Admin Panel</h1>
            <p className="text-sm text-muted-foreground">{user.name}</p>
          </div>
        </div>
        {point && (
          <Button variant="outline" size="sm" asChild>
            <a href={`/vizitka/${point.vizitkaCode}`} target="_blank" rel="noreferrer">
              <ExternalLink className="w-4 h-4 mr-2" /> Vizitka
            </a>
          </Button>
        )}
      </div>

      {!user.assignedPointId ? (
        <Card>
          <CardContent className="py-16 text-center">
            <MapPin className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-40" />
            <p className="font-medium">Sizga hali nuqta biriktirilmagan</p>
            <p className="text-sm text-muted-foreground mt-1">Sudo administratori sizga nuqta biriktirishi kerak.</p>
          </CardContent>
        </Card>
      ) : isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => <div key={i} className="h-20 bg-muted animate-pulse rounded-xl" />)}
        </div>
      ) : point ? (
        <div className="space-y-6">
          {/* Basic Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Asosiy ma'lumotlar</CardTitle>
              <CardDescription>Nuqta nomini, tavsifini va kategoriyasini tahrirlang.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Nomi *</Label>
                <Input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} data-testid="input-admin-name" />
              </div>
              <div className="space-y-2">
                <Label>Tavsif</Label>
                <Textarea value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} rows={3} data-testid="input-admin-description" />
              </div>
              <div className="space-y-2">
                <Label>Kategoriya</Label>
                <Select value={form.categoryId || "none"} onValueChange={(v) => setForm(f => ({ ...f, categoryId: v === "none" ? "" : v }))}>
                  <SelectTrigger data-testid="select-admin-category">
                    <SelectValue placeholder="Kategoriya tanlang..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Kategoriyasiz</SelectItem>
                    {categories?.map(c => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <MapPin className="w-3 h-3" /> Koordinatalar: {point.lat.toFixed(4)}, {point.lng.toFixed(4)} (o'zgartirish mumkin emas)
              </div>
              <Button onClick={handleSave} disabled={updatePoint.isPending} data-testid="btn-admin-save">
                <Save className="w-4 h-4 mr-2" />
                {updatePoint.isPending ? "Saqlanmoqda..." : "Saqlash"}
              </Button>
            </CardContent>
          </Card>

          {/* Contacts */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Kontaktlar</CardTitle>
                  <CardDescription>Telefon, Telegram, Instagram va boshqa kontaktlar</CardDescription>
                </div>
                <Button size="sm" variant="outline" onClick={() => { setContactModal(true); setContactForm({ type: "phone", value: "", label: "" }); }} data-testid="btn-admin-add-contact">
                  <Plus className="w-4 h-4 mr-2" /> Qo'shish
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {point.contacts && point.contacts.length > 0 ? (
                <div className="space-y-2">
                  {point.contacts.map((c: any) => (
                    <div key={c.id} className="flex items-center gap-3 p-3 rounded-lg border" data-testid={`contact-item-${c.id}`}>
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                        {c.type === "phone" && <Phone className="w-4 h-4" />}
                        {c.type === "telegram" && <SiTelegram className="w-4 h-4" />}
                        {c.type === "instagram" && <SiInstagram className="w-4 h-4" />}
                        {c.type === "website" && <Globe className="w-4 h-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{c.value}</p>
                        <p className="text-xs text-muted-foreground">{c.label || CONTACT_TYPE_LABELS[c.type]}</p>
                      </div>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0">
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Kontaktni o'chirish</AlertDialogTitle>
                            <AlertDialogDescription>"{c.value}" kontaktini o'chirishni tasdiqlaysizmi?</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Bekor qilish</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteContact.mutate({ id: point.id, contactId: c.id }, { onSuccess: () => { toast({ title: "O'chirildi" }); invalidate(); } })}>O'chirish</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">Kontaktlar yo'q</p>
              )}
            </CardContent>
          </Card>

          {/* Images */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Rasmlar</CardTitle>
                  <CardDescription>URL manzil orqali rasm qo'shing</CardDescription>
                </div>
                <Button size="sm" variant="outline" onClick={() => { setImageModal(true); setImageUrl(""); }} data-testid="btn-admin-add-image">
                  <Plus className="w-4 h-4 mr-2" /> Rasm
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {point.images && point.images.length > 0 ? (
                <div className="grid grid-cols-3 gap-3">
                  {point.images.map((img: any) => (
                    <div key={img.id} className="relative group aspect-square rounded-lg overflow-hidden border" data-testid={`image-item-${img.id}`}>
                      <img src={img.url} alt="" className="w-full h-full object-cover" />
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <button className="absolute inset-0 bg-black/60 hidden group-hover:flex items-center justify-center text-white transition-opacity">
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Rasmni o'chirish</AlertDialogTitle>
                            <AlertDialogDescription>Bu rasmni o'chirishni tasdiqlaysizmi?</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Bekor qilish</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteImage.mutate({ id: point.id, imageId: img.id }, { onSuccess: () => { toast({ title: "O'chirildi" }); invalidate(); } })}>O'chirish</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <ImageIcon className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Rasmlar yo'q</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* Contact Dialog */}
      <Dialog open={contactModal} onOpenChange={setContactModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Kontakt qo'shish</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Tur</Label>
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
            <div className="space-y-2">
              <Label>Qiymat *</Label>
              <Input value={contactForm.value} onChange={(e) => setContactForm(f => ({ ...f, value: e.target.value }))}
                placeholder={contactForm.type === "phone" ? "+998..." : contactForm.type === "telegram" ? "@username" : contactForm.type === "instagram" ? "@username" : "https://..."}
              />
            </div>
            <div className="space-y-2">
              <Label>Yorliq (ixtiyoriy)</Label>
              <Input value={contactForm.label} onChange={(e) => setContactForm(f => ({ ...f, label: e.target.value }))} placeholder="Asosiy, Navbatchi..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setContactModal(false)}>Bekor</Button>
            <Button onClick={handleAddContact} disabled={!contactForm.value || addContact.isPending}>
              <Plus className="w-4 h-4 mr-2" /> Qo'shish
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Image Dialog */}
      <Dialog open={imageModal} onOpenChange={setImageModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Rasm qo'shish</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Rasm URL *</Label>
              <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://example.com/image.jpg" />
            </div>
            {imageUrl && <img src={imageUrl} alt="preview" className="w-full h-32 object-cover rounded-lg border" onError={(e) => (e.currentTarget.style.display = "none")} />}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImageModal(false)}>Bekor</Button>
            <Button onClick={handleAddImage} disabled={!imageUrl || addImage.isPending}>
              <ImageIcon className="w-4 h-4 mr-2" /> Qo'shish
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
