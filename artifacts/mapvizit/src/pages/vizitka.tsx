import { useParams, Link, useLocation } from "wouter";
import {
  useGetVizitka, getGetVizitkaQueryKey,
  useGetMe, getGetMeQueryKey,
  useGetSettings, getGetSettingsQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { QRCodeSVG } from "qrcode.react";
import { MapPin, Phone, Globe, Image as ImageIcon, Crown, ArrowLeft } from "lucide-react";
import { SiTelegram, SiInstagram } from "react-icons/si";

export default function Vizitka() {
  const { code } = useParams();
  const [, setLocation] = useLocation();
  const { data: vizitka, isLoading, isError } = useGetVizitka(code || "", {
    query: { queryKey: getGetVizitkaQueryKey(code || ""), enabled: !!code }
  });
  const { data: user } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  const { data: settings } = useGetSettings({ query: { queryKey: getGetSettingsQueryKey() } });

  const hasPremium = user?.role === "sudo" || user?.role === "premium" || !!user?.isPremium;
  const isAdminOfThis = user?.role === "admin" && user?.assignedPointId === vizitka?.point?.id;
  const premiumActive = !!(settings?.premiumEnabled);
  const canViewContacts = !premiumActive || hasPremium || isAdminOfThis;

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center p-4">
        <Skeleton className="w-full max-w-md h-96 rounded-2xl" />
      </div>
    );
  }

  if (isError || !vizitka) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center p-4 text-center">
        <h1 className="text-2xl font-bold">Vizitka topilmadi</h1>
        <p className="text-muted-foreground mt-2">Bu havola noto'g'ri yoki o'chirilgan.</p>
        <Link href="/map" className="mt-4">
          <Button>Xaritaga qaytish</Button>
        </Link>
      </div>
    );
  }

  // Admin premium bo'lmasa — vizitka yopiq
  if ((vizitka as any).premiumRequired) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center p-4 text-center gap-4">
        <div className="w-20 h-20 rounded-full bg-yellow-500/10 flex items-center justify-center">
          <Crown className="w-10 h-10 text-yellow-400" />
        </div>
        <h1 className="text-2xl font-bold">{(vizitka as any).pointName}</h1>
        <p className="text-muted-foreground max-w-xs">
          Bu biznes kartani ko'rish uchun admin tomonidan
          <span className="text-yellow-400 font-medium"> Premium </span>
          obuna faollashtirish talab qilinadi.
        </p>
        <Link href="/map">
          <Button variant="outline" className="rounded-full px-8">
            <MapPin className="w-4 h-4 mr-2" /> Xaritaga qaytish
          </Button>
        </Link>
      </div>
    );
  }

  const { point } = vizitka;

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col p-4 md:p-8 items-center">
      {/* Orqaga tugma */}
      <div className="w-full max-w-md mb-3">
        <Button variant="ghost" size="sm" className="gap-2 -ml-2" onClick={() => window.history.length > 1 ? window.history.back() : setLocation("/map")}>
          <ArrowLeft className="w-4 h-4" /> Orqaga
        </Button>
      </div>
      <Card className="w-full max-w-md overflow-hidden border-0 shadow-2xl bg-card">
        {/* Cover Image */}
        <div className="h-48 bg-muted relative">
          {point.images && point.images.length > 0 ? (
            <img
              src={point.images[0].url}
              alt={point.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-primary/10 text-primary">
              <ImageIcon className="w-12 h-12 opacity-50" />
            </div>
          )}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
            <h1 className="text-2xl font-bold text-white">{point.name}</h1>
            {point.category && (
              <span className="inline-flex items-center rounded-full bg-primary/80 px-2.5 py-0.5 text-xs font-semibold text-white mt-2">
                {point.category.name}
              </span>
            )}
          </div>
        </div>

        <CardContent className="p-6 space-y-6">
          {point.description && (
            <p className="text-sm text-muted-foreground leading-relaxed">
              {point.description}
            </p>
          )}

          <div className="space-y-3">
            <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Bog'lanish</h3>

            {point.contacts?.map((contact) => {
              if (!canViewContacts) {
                return (
                  <div key={contact.id} className="flex items-center p-3 rounded-xl border bg-muted/30">
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mr-4 flex-shrink-0">
                      {contact.type === "phone" && <Phone className="w-5 h-5 text-muted-foreground" />}
                      {contact.type === "telegram" && <SiTelegram className="w-5 h-5 text-muted-foreground" />}
                      {contact.type === "instagram" && <SiInstagram className="w-5 h-5 text-muted-foreground" />}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-muted-foreground blur-sm select-none">••••••••••</p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <Crown className="w-3 h-3 text-yellow-400" />
                        <p className="text-xs text-yellow-500 font-medium">Premium talab qilinadi</p>
                      </div>
                    </div>
                  </div>
                );
              }
              return (
                <a
                  key={contact.id}
                  href={
                    contact.type === "phone" ? `tel:${contact.value}` :
                    contact.type === "telegram" ? `https://t.me/${contact.value.replace("@", "")}` :
                    contact.type === "instagram" ? `https://instagram.com/${contact.value.replace("@", "")}` :
                    contact.value
                  }
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center p-3 rounded-xl hover:bg-muted transition-colors border"
                >
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mr-4 flex-shrink-0 text-primary">
                    {contact.type === "phone" && <Phone className="w-5 h-5" />}
                    {contact.type === "telegram" && <SiTelegram className="w-5 h-5" />}
                    {contact.type === "instagram" && <SiInstagram className="w-5 h-5" />}
                    {contact.type === "website" && <Globe className="w-5 h-5" />}
                  </div>
                  <div className="overflow-hidden">
                    <p className="font-medium truncate">{contact.label || contact.value}</p>
                    <p className="text-xs text-muted-foreground uppercase">{contact.type}</p>
                  </div>
                </a>
              );
            })}

            {(!point.contacts || point.contacts.length === 0) && (
              <p className="text-sm text-muted-foreground italic">Kontakt ma'lumotlari kiritilmagan.</p>
            )}

            {!canViewContacts && premiumActive && (
              <div className="p-3 rounded-xl border border-yellow-500/30 bg-yellow-500/5 flex items-center gap-3">
                <Crown className="w-4 h-4 text-yellow-400 shrink-0" />
                <p className="text-xs text-muted-foreground">
                  To'liq ma'lumot uchun <span className="text-yellow-400 font-medium">Premium</span> talab qilinadi.
                </p>
              </div>
            )}
          </div>

          <div className="pt-6 border-t flex flex-col items-center">
            <p className="text-sm text-muted-foreground mb-4 text-center">Ushbu vizitkani ulashish</p>
            <div className="p-3 bg-white rounded-xl shadow-sm">
              <QRCodeSVG
                value={typeof window !== "undefined" ? `${window.location.origin}/vizitka/${code}` : ""}
                size={160}
                level="H"
                includeMargin={false}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="mt-8 text-center">
        <Link href="/map">
          <Button variant="outline" className="rounded-full px-8">
            <MapPin className="w-4 h-4 mr-2" /> Xaritada ko'rish
          </Button>
        </Link>
      </div>
    </div>
  );
}
