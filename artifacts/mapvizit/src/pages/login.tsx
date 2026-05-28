import { useState } from "react";
import { useLocation } from "wouter";
import { useLogin } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { NomerchiLogo } from "@/components/nomerchi-logo";

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const loginMutation = useLogin();
  
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate({ data: { username, password } }, {
      onSuccess: (data) => {
        localStorage.setItem("mapvizit_token", data.token);
        toast({ title: "Xush kelibsiz!", description: "Tizimga muvaffaqiyatli kirdingiz." });
        setLocation("/map");
      },
      onError: (err) => {
        toast({ title: "Xato", description: err.message || "Login yoki parol noto'g'ri.", variant: "destructive" });
      }
    });
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
                disabled={loginMutation.isPending}
              >
                {loginMutation.isPending ? "Kirilmoqda..." : "Kirish"}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
