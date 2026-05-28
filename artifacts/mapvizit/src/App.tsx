import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "next-themes";
import NotFound from "@/pages/not-found";

import Login from "@/pages/login";
import MapPage from "@/pages/map";
import Vizitka from "@/pages/vizitka";
import Saved from "@/pages/saved";
import Sudo from "@/pages/sudo";
import Admin from "@/pages/admin";
import Profile from "@/pages/profile";

const queryClient = new QueryClient();

function HomeRedirect() {
  const hasToken = !!localStorage.getItem("mapvizit_token");
  return hasToken ? <Redirect to="/map" /> : <Login />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={HomeRedirect} />
      <Route path="/login" component={Login} />
      <Route path="/map" component={MapPage} />
      <Route path="/vizitka/:code" component={Vizitka} />
      <Route path="/saved" component={Saved} />
      <Route path="/sudo" component={Sudo} />
      <Route path="/admin" component={Admin} />
      <Route path="/profile" component={Profile} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
