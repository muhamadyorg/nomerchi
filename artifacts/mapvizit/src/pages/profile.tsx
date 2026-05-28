import { useGetMe, useGetSettings, getGetSettingsQueryKey } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { 
  ChevronLeft, User, Phone, Crown, Shield, Bookmark, LogOut, 
  MapPin, Settings, Star
} from "lucide-react";
import { SiTelegram } from "react-icons/si";

const ROLE_LABELS: Record<string, string> = {
  sudo: "Super Admin",
  admin: "Admin",
  premium: "Premium",
  viewer: "Oddiy foydalanuvchi",
};

const ROLE_ICONS: Record<string, React.ReactNode> = {
  sudo: <Crown className="w-4 h-4 text-red-400" />,
  admin: <Shield className="w-4 h-4 text-blue-400" />,
  premium: <Star className="w-4 h-4 text-yellow-400" />,
  viewer: <User className="w-4 h-4 text-muted-foreground" />,
};

export default function Profile() {
  const [, setLocation] = useLocation();
  const { data: user, isError } = useGetMe();
  const { data: settings } = useGetSettings({ query: { queryKey: getGetSettingsQueryKey(), enabled: !!user } });

  useEffect(() => {
    if (isError) setLocation("/login");
  }, [isError, setLocation]);

  if (!user) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const handleLogout = () => {
    localStorage.removeItem("mapvizit_token");
    setLocation("/login");
  };

  const isPremium = user.role === "sudo" || user.role === "admin" || user.isPremium || user.role === "premium";

  return (
    <div className="min-h-screen bg-background p-4 max-w-md mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/map")}>
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-xl font-bold">Profil</h1>
      </div>

      {/* Avatar & Name */}
      <Card className="mb-4">
        <CardContent className="pt-6 flex flex-col items-center text-center pb-6">
          <Avatar className="w-20 h-20 border-4 border-primary/20 mb-4">
            <AvatarFallback className="text-2xl font-bold bg-primary/10 text-primary">
              {user.name?.substring(0, 2).toUpperCase() || "U"}
            </AvatarFallback>
          </Avatar>
          <h2 className="text-xl font-bold">{user.name}</h2>
          <p className="text-sm text-muted-foreground mb-3">@{user.username}</p>
          <div className="flex items-center gap-2">
            {ROLE_ICONS[user.role]}
            <Badge variant="outline" className="text-xs">{ROLE_LABELS[user.role]}</Badge>
            {isPremium && user.role !== "sudo" && user.role !== "admin" && (
              <Badge className="text-xs bg-yellow-500/20 text-yellow-400 border-yellow-500/30 hover:bg-yellow-500/30">
                Premium
              </Badge>
            )}
          </div>
          {user.premiumExpiresAt && (
            <p className="text-xs text-muted-foreground mt-2">
              Premium: {new Date(user.premiumExpiresAt).toLocaleDateString("uz-UZ")} gacha
            </p>
          )}
        </CardContent>
      </Card>

      {/* Contact Info */}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-base">Ma'lumotlar</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {user.phone && (
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-green-500/10 flex items-center justify-center">
                <Phone className="w-4 h-4 text-green-400" />
              </div>
              <div>
                <p className="font-medium text-sm">{user.phone}</p>
                <p className="text-xs text-muted-foreground">Telefon</p>
              </div>
            </div>
          )}
          {user.telegramId && (
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-blue-500/10 flex items-center justify-center">
                <SiTelegram className="w-4 h-4 text-blue-400" />
              </div>
              <div>
                <p className="font-medium text-sm">{user.telegramUsername ? `@${user.telegramUsername}` : `ID: ${user.telegramId}`}</p>
                <p className="text-xs text-muted-foreground">Telegram</p>
              </div>
            </div>
          )}
          {user.assignedPointId && (
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
                <MapPin className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="font-medium text-sm">Nuqta #{user.assignedPointId}</p>
                <p className="text-xs text-muted-foreground">Biriktirilgan nuqta</p>
              </div>
            </div>
          )}
          {!user.phone && !user.telegramId && !user.assignedPointId && (
            <p className="text-sm text-muted-foreground text-center py-2">Qo'shimcha ma'lumotlar yo'q</p>
          )}
        </CardContent>
      </Card>

      {/* Quick actions */}
      <div className="space-y-2 mb-4">
        <Button variant="outline" className="w-full justify-start gap-3 h-12" onClick={() => setLocation("/saved")}>
          <Bookmark className="w-4 h-4" />
          Saqlangan nuqtalar
        </Button>
        {user.role === "sudo" && (
          <Button variant="outline" className="w-full justify-start gap-3 h-12" onClick={() => setLocation("/sudo")}>
            <Settings className="w-4 h-4" />
            Sudo panel
          </Button>
        )}
        {user.role === "admin" && (
          <Button variant="outline" className="w-full justify-start gap-3 h-12" onClick={() => setLocation("/admin")}>
            <Shield className="w-4 h-4" />
            Admin panel
          </Button>
        )}
      </div>

      <Button variant="destructive" className="w-full gap-2" onClick={handleLogout} data-testid="btn-logout">
        <LogOut className="w-4 h-4" />
        Chiqish
      </Button>
    </div>
  );
}
