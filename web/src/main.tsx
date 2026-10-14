import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { createRootRoute, createRoute, createRouter, Link, Outlet, RouterProvider, useNavigate, useRouterState } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { io, type Socket } from "socket.io-client";
import { CalendarDays, ChartNoAxesCombined, ChevronDown, FileText, LayoutDashboard, LogOut, Menu, Wallet, X } from "lucide-react";
import { Toaster, toast } from "sonner";
import "./style.css";

type Company = { id: string; nome: string };
type Session = { id: string; email: string; nome: string; perfil: string; empresa_padrao_id: string | null; pode_visualizar_relatorios: boolean; empresas: Company[] };
const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3333";
let accessToken = "";
let refreshInFlight: Promise<boolean> | undefined;
const refreshAccessToken = () => refreshInFlight ??= fetch(`${apiUrl}/auth/refresh`, { method: "POST", credentials: "include" }).then(async (response) => { if (!response.ok) return false; accessToken = (await response.json()).accessToken; return true; }).catch(() => false).finally(() => { refreshInFlight = undefined; });
const http = async (path: string, init: RequestInit = {}) => {
  const send = () => fetch(`${apiUrl}${path}`, { ...init, credentials: "include", headers: { ...(init.body instanceof FormData ? {} : { "Content-Type": "application/json" }), ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}), ...init.headers } });
  let response = await send();
  if (response.status === 401 && !["/auth/login", "/auth/refresh", "/auth/logout"].includes(path) && await refreshAccessToken()) response = await send();
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.message ?? "Não foi possível concluir a operação.");
  return response.status === 204 ? undefined : response.json();
};
const AuthContext = createContext<{ session: Session | undefined; socket: Socket | null }>({ session: undefined, socket: null });
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } });
const menus = [
  { label: "Visão geral", to: "/", icon: LayoutDashboard, profiles: ["super_administrador", "administrador", "financeiro"] },
  { label: "Agenda", to: "/agenda", icon: CalendarDays, profiles: ["super_administrador", "administrador", "contrato", "agenda", "vendedor", "produtor"] },
  { label: "Contratos", to: "/contratos", icon: FileText, profiles: ["super_administrador", "administrador", "contrato", "financeiro"] },
  { label: "Financeiro", to: "/financeiro", icon: Wallet, profiles: ["super_administrador", "administrador", "financeiro"] },
  { label: "Relatórios", to: "/relatorios", icon: ChartNoAxesCombined, profiles: ["super_administrador", "administrador", "financeiro"] },
];
function Login() {
  const [error, setError] = useState(""); const query = useQueryClient(); const navigate = useNavigate();
  const login = useMutation({ mutationFn: async (data: { email: string; senha: string }) => { const result = await http("/auth/login", { method: "POST", body: JSON.stringify(data) }); accessToken = result.accessToken; return http("/auth/me"); }, onSuccess: (session) => { query.setQueryData(["session"], session); void navigate({ to: "/" }); }, onError: (e: Error) => setError(e.message) });
  return <main className="login-page"><form className="login-card" onSubmit={(e) => { e.preventDefault(); const form = new FormData(e.currentTarget); login.mutate({ email: String(form.get("email")), senha: String(form.get("senha")) }); }}><span className="brand-mark">CS</span><h1>Camarote Shows</h1><p>Acesse sua operação</p><label>E-mail<input name="email" type="email" autoComplete="username" required /></label><label>Senha<input name="senha" type="password" autoComplete="current-password" required /></label>{error && <p className="error">{error}</p>}<button className="primary" disabled={login.isPending}>{login.isPending ? "Entrando…" : "Entrar"}</button><button className="forgot" type="button" onClick={async () => { const email = prompt("Informe o e-mail do seu cadastro"); if (email) { await http("/auth/esqueci-senha", { method: "POST", body: JSON.stringify({ email }) }); toast.success("Se o cadastro estiver ativo, o link chegará pelo WhatsApp."); } }}>Esqueci minha senha</button></form></main>;
}
function PasswordLinkPage({ mode }: { mode: "primeiro-acesso" | "redefinir-senha" }) {
  const query = useQueryClient(); const [error, setError] = useState(""); const navigate = useNavigate(); const token = new URLSearchParams(window.location.search).get("token") ?? "";
  const submit = useMutation({ mutationFn: (senha: string) => http(`/auth/${mode}`, { method: "POST", body: JSON.stringify({ token, senha }) }), onSuccess: async () => { accessToken = ""; await query.invalidateQueries({ queryKey: ["session"] }); toast.success(mode === "primeiro-acesso" ? "Acesso ativado. Entre com sua nova senha." : "Senha redefinida. Entre com sua nova senha."); await navigate({ to: "/" }); }, onError: (e: Error) => setError(e.message) });
  return <main className="login-page"><form className="login-card" onSubmit={(e) => { e.preventDefault(); const values = new FormData(e.currentTarget); const senha = String(values.get("senha")); if (senha !== values.get("confirmacao")) { setError("As senhas não conferem."); return; } if (senha.length < 12) { setError("Use pelo menos 12 caracteres."); return; } submit.mutate(senha); }}><span className="brand-mark">CS</span><h1>{mode === "primeiro-acesso" ? "Ative seu acesso" : "Redefina sua senha"}</h1><p>Crie uma senha com pelo menos 12 caracteres.</p><label>Nova senha<input name="senha" type="password" autoComplete="new-password" minLength={12} required /></label><label>Confirme a senha<input name="confirmacao" type="password" autoComplete="new-password" minLength={12} required /></label>{error && <p className="error">{error}</p>}<button className="primary" disabled={submit.isPending || !token}>{submit.isPending ? "Salvando…" : "Salvar senha"}</button>{!token && <p className="error">O link não contém um token válido.</p>}</form></main>;
}
function Shell() {
  const queryClient = useQueryClient(); const navigate = useNavigate(); const path = useRouterState({ select: (s) => s.location.pathname }); const [menuOpen, setMenuOpen] = useState(false);
  const sessionQuery = useQuery<Session>({ queryKey: ["session"], queryFn: async () => { const refreshed = await http("/auth/refresh", { method: "POST" }); accessToken = refreshed.accessToken; return http("/auth/me"); }, retry: false });
  const session = sessionQuery.data;
  const [companyId, setCompanyId] = useState(session?.empresa_padrao_id ?? "");
  useEffect(() => { if (session?.empresa_padrao_id) setCompanyId(session.empresa_padrao_id); }, [session?.empresa_padrao_id]);
  const socket = useMemo(() => session ? io(apiUrl.startsWith("/") ? window.location.origin : apiUrl, { path: "/socket.io", auth: { token: accessToken }, withCredentials: true }) : null, [session?.id]);
  useEffect(() => { if (!socket) return; socket.on("data.changed", (event: { empresa_id: string; table: string }) => { if (event.empresa_id === companyId) queryClient.invalidateQueries({ queryKey: [event.table] }); }); socket.on("connect_error", () => {}); return () => { socket.disconnect(); }; }, [socket, companyId, queryClient]);
  const changeCompany = useMutation({ mutationFn: (id: string) => http("/auth/empresa-padrao", { method: "PUT", body: JSON.stringify({ empresaId: id }) }), onSuccess: (_result, id) => { setCompanyId(id); queryClient.invalidateQueries(); } });
  const logout = useMutation({ mutationFn: () => http("/auth/logout", { method: "POST" }), onSettled: () => { accessToken = ""; socket?.disconnect(); queryClient.clear(); void navigate({ to: "/" }); } });
  if (sessionQuery.isPending) return <div className="loading">Carregando sua sessão…</div>;
  if (path === "/primeiro-acesso" || path === "/redefinir-senha") return <PasswordLinkPage mode={path.slice(1) as "primeiro-acesso" | "redefinir-senha"}/>;
  if (!session) return <Login />;
  const available = menus.filter((item) => item.profiles.includes(session.perfil) && (item.to !== "/relatorios" || session.pode_visualizar_relatorios || ["super_administrador", "administrador"].includes(session.perfil)));
  const title = menus.find((item) => item.to === path)?.label ?? "Visão geral";
  return <AuthContext.Provider value={{ session, socket }}><div className="app-shell"><aside className={`sidebar ${menuOpen ? "open" : ""}`}><div className="side-brand"><span className="brand-mark">CS</span><strong>Camarote<br/>Shows</strong><button className="icon-button close-nav" onClick={() => setMenuOpen(false)} aria-label="Fechar menu"><X/></button></div><div className="side-caption">OPERAÇÃO</div><nav>{available.map(({ label, to, icon: Icon }) => <Link key={to} to={to} className={`nav-link ${path === to ? "active" : ""}`} onClick={() => setMenuOpen(false)}><Icon size={19}/>{label}</Link>)}</nav><div className="side-bottom"><div className="user-avatar">{session.nome.slice(0,1)}</div><div className="user-meta"><b>{session.nome}</b><small>{session.perfil.replaceAll("_", " ")}</small></div><button className="icon-button" title="Sair" onClick={() => logout.mutate()}><LogOut size={19}/></button></div></aside>{menuOpen && <button className="scrim" onClick={() => setMenuOpen(false)} aria-label="Fechar menu"/>}<section className="workspace"><header className="topbar"><button className="icon-button open-nav" onClick={() => setMenuOpen(true)} aria-label="Abrir menu"><Menu/></button><h2>{title}</h2><label className="company-select"><span>Empresa</span><select value={companyId} onChange={(e) => changeCompany.mutate(e.target.value)} aria-label="Empresa padrão">{session.empresas.map((company) => <option key={company.id} value={company.id}>{company.nome}</option>)}</select><ChevronDown size={15}/></label><button className="top-logout" onClick={() => logout.mutate()}><LogOut size={17}/> Sair</button></header><main className="content"><Outlet/></main></section><Toaster richColors position="top-right"/></div></AuthContext.Provider>;
}
function Home() { const { session } = useContext(AuthContext); return <><div className="welcome"><span className="eyebrow">PAINEL DE OPERAÇÃO</span><h1>Olá, {session?.nome.split(" ")[0]}</h1><p>Acompanhe os módulos disponíveis para o seu perfil.</p></div><div className="module-grid">{menus.filter((m) => m.to !== "/" && session && m.profiles.includes(session.perfil)).map(({ label, to, icon: Icon }) => <Link to={to} className="module-card" key={to}><span className="module-icon"><Icon/></span><b>{label}</b><span>Acessar módulo <span aria-hidden>→</span></span></Link>)}</div><div className="notice"><b>Ambiente preparado</b><span>Os módulos serão liberados conforme as próximas fases do projeto.</span></div></>; }
function ModulePage() { const path = useRouterState({ select: (s) => s.location.pathname }); const menu = menus.find((m) => m.to === path); return <div className="module-placeholder"><span className="module-icon"><CalendarDays/></span><h1>{menu?.label}</h1><p>Este módulo será implementado na fase correspondente do projeto.</p></div>; }
const rootRoute = createRootRoute({ component: Shell });
const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: Home });
const moduleRoutes = ["agenda", "contratos", "financeiro", "relatorios"].map((slug) => createRoute({ getParentRoute: () => rootRoute, path: `/${slug}`, component: ModulePage }));
const accessRoutes = ["primeiro-acesso", "redefinir-senha"].map((slug) => createRoute({ getParentRoute: () => rootRoute, path: `/${slug}`, component: () => null }));
const router = createRouter({ routeTree: rootRoute.addChildren([indexRoute, ...moduleRoutes, ...accessRoutes]) });
createRoot(document.getElementById("root")!).render(<React.StrictMode><QueryClientProvider client={queryClient}><RouterProvider router={router}/></QueryClientProvider></React.StrictMode>);
