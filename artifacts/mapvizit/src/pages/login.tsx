import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { NomerchiLogo } from "@/components/nomerchi-logo";

export default function Login() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const { toast } = useToast();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (search.includes("kicked=1")) {
      toast({ title: "Siz boshqa qurilmadan chiqarildingiz", description: "Qayta kiring.", variant: "destructive" });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doLogin = async (force: boolean) => {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, force }),
      });
      const data = await res.json();

      if (res.status === 409 && data.requiresForce) {
        setShowConfirm(true);
        return;
      }
      if (!res.ok) {
        toast({ title: "Xato", description: data.error || "Login yoki parol noto'g'ri.", variant: "destructive" });
        return;
      }
      localStorage.setItem("mapvizit_token", data.token);
      toast({ title: "Xush kelibsiz!", description: "Tizimga muvaffaqiyatli kirdingiz." });
      setLocation("/map");
    } catch {
      toast({ title: "Xato", description: "Serverga ulanib bo'lmadi.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    doLogin(false);
  };

  const handleForceLogin = () => {
    setShowConfirm(false);
    doLogin(true);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8 gap-3">
          <NomerchiLogo size={72} />
          <div className="text-center">
            <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-violet-400 bg-clip-text text-transparent tracking-tight">
              Nomerchi
            </h1>
            <p className="text-slate-400 text-sm mt-1">Xarita va raqamli vizitka platformasi</p>
          </div>
        </div>

        {/* Boshqa qurilma ogohlantirishi */}
        {showConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-6 max-w-sm w-full space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
                  <span className="text-xl">⚠️</span>
                </div>
                <div>
                  <p className="font-semibold text-slate-100">Hisob boshqa qurilmada ochiq</p>
                  <p className="text-sm text-slate-400 mt-0.5">OK bosganda eski qurilmadan avtomatik chiqiladi</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1 border-slate-700 text-slate-300"
                  onClick={() => setShowConfirm(false)}
                >
                  Bekor qilish
                </Button>
                <Button
                  className="flex-1 bg-amber-600 hover:bg-amber-500 text-white"
                  onClick={handleForceLogin}
                  disabled={loading}
                >
                  {loading ? "Kirilmoqda..." : "OK — Kirish"}
                </Button>
              </div>
            </div>
          </div>
        )}

        <Card className="border-slate-800 bg-slate-900/80 backdrop-blur shadow-2xl">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg text-slate-100">Tizimga kirish</CardTitle>
            <CardDescription className="text-slate-400">
              Foydalanuvchi nomi va parolingizni kiriting
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username" className="text-slate-300">Foydalanuvchi nomi</Label>
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="bg-slate-800 border-slate-700 text-slate-100 placeholder:text-slate-500 focus:border-blue-500"
                  placeholder="username"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-slate-300">Parol</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-slate-800 border-slate-700 text-slate-100 placeholder:text-slate-500 focus:border-blue-500"
                  placeholder="••••••••"
                  required
                />
              </div>
            </CardContent>
            <CardFooter>
              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white font-semibold shadow-lg"
                disabled={loading}
              >
                {loading ? "Kirilmoqda..." : "Kirish"}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
