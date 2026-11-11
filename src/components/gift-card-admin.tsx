import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Tables } from "@/integrations/supabase/types";
import {
  finalizeGiftCardRows,
  formatNaira,
  getAuthErrorMessage,
  isValidCardAmount,
  maskVoucherCode,
  parseGiftCardUploadFile,
  type CsvCardRow,
  type GiftCardDraftRow,
} from "@/lib/gift-card.utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  ArrowDownLeft, ArrowLeft, ArrowRight, ArrowUpRight, BarChart3, Bell, Check, ChevronDown,
  CircleHelp, CreditCard, Download, Eye, EyeOff, FileUp, Fingerprint, LayoutDashboard,
  LockKeyhole, LogOut, Menu, MoreHorizontal, Plus, Search, Settings2, ShieldCheck, Sparkles,
  TrendingDown, TrendingUp, WalletCards, X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const SKYMART_LOGO_SRC = "/skymart-logo.png";

function SkymartLogo({ className, imgClassName }: { className?: string; imgClassName?: string }) {
  return (
    <div className={cn("inline-flex items-center justify-center overflow-hidden rounded-md bg-black", className)}>
      <img src={SKYMART_LOGO_SRC} alt="Skymart" className={cn("h-8 w-auto max-w-full object-contain object-left", imgClassName)} />
    </div>
  );
}

type CardRow = Tables<"gift_cards">;
type TransactionRow = Tables<"transactions">;
type DashboardStats = {
  total_cards: number;
  activated_cards: number;
  total_active_balance: number;
  total_amount_added: number;
  total_amount_deducted: number;
};
type Screen = "dashboard" | "gift-cards" | "transactions" | "settings";
type StatusFilter = "all" | "active" | "inactive" | "depleted";
type AuthMode = "signin" | "forgot" | "reset";
type TableSort = "newest" | "oldest" | "largest";
type Adjustment = "add" | "deduct";

const NAV_ITEMS: { id: Screen; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "gift-cards", label: "Gift cards", icon: WalletCards },
  { id: "transactions", label: "Transactions", icon: BarChart3 },
  { id: "settings", label: "Settings", icon: Settings2 },
];

function getErrorMessage(error: { code?: string; message?: string } | null | undefined, fallback: string) {
  if (!error) return fallback;
  if (error.code === "23505") return "That serial number or voucher code already exists.";
  if (error.code === "42501") return "This account is not authorized to access the admin panel.";
  if (error.message?.includes("Deduction exceeds available balance")) return "This amount exceeds the card’s available balance.";
  if (error.message?.includes("Only active cards")) return "Only active cards can be charged.";
  if (error.message?.includes("Not authorized")) return "This account is not authorized to manage gift cards.";
  return fallback;
}

function useAuth() {
  const [email, setEmail] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<AuthMode>(() => {
    if (typeof window !== "undefined" && window.location.hash.includes("type=recovery")) return "reset";
    return "signin";
  });

  useEffect(() => {
    let mounted = true;
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setEmail(session?.user.email ?? null);
      setReady(true);
    });
    void supabase.auth.getUser().then(({ data }) => {
      if (mounted) {
        setEmail(data.user?.email ?? null);
        setReady(true);
      }
    }).catch(() => {
      if (mounted) setReady(true);
    });
    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  return { email, ready, mode, setMode, setEmail };
}

function AuthScreen({ mode, setMode, onAuthenticated }: { mode: AuthMode; setMode: (mode: AuthMode) => void; onAuthenticated: (email: string | null) => void }) {
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  async function signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) toast.error(getAuthErrorMessage(error.message));
    else onAuthenticated(data.user.email ?? null);
    setBusy(false);
  }

  async function sendReset(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/#type=recovery` });
    if (error) toast.error(getAuthErrorMessage(error.message));
    else toast.success("If the account exists, password reset instructions have been sent.");
    setBusy(false);
  }

  async function updatePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (newPassword.length < 8) { toast.error("Use at least 8 characters for the new password."); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) toast.error(getAuthErrorMessage(error.message));
    else { toast.success("Your password has been updated."); setMode("signin"); window.history.replaceState(null, "", window.location.pathname); }
    setBusy(false);
  }

  const isReset = mode === "reset";
  const isForgot = mode === "forgot";
  return (
    <main className="relative grid min-h-screen overflow-hidden bg-background lg:grid-cols-[minmax(0,1fr)_minmax(440px,0.88fr)]">
      <section className="relative flex min-h-[40vh] flex-col justify-between overflow-hidden bg-primary px-7 py-8 text-primary-foreground sm:px-12 lg:min-h-screen lg:px-16 lg:py-12">
        <div className="absolute inset-0 dashboard-grid opacity-50" />
        <div className="relative flex items-center gap-3">
          <SkymartLogo className="px-2.5 py-1.5 ring-1 ring-primary-foreground/20" imgClassName="h-9" />
          <span className="ml-auto rounded-full border border-primary-foreground/25 px-3 py-1 text-xs">ADMIN PORTAL</span>
        </div>
        <div className="relative max-w-lg py-10">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary-foreground/25 px-3 py-1.5 text-xs"><ShieldCheck className="size-3.5" /> Your cards, clearly in view</div>
          <h1 className="font-display text-4xl font-semibold leading-tight sm:text-5xl">Simple card control.<br />Clear balances.</h1>
          <p className="mt-5 max-w-md text-sm leading-7 text-primary-foreground/75">A single workspace for managing gift cards, tracking voucher balances and reviewing every adjustment.</p>
          <div className="mt-9 grid grid-cols-3 border-y border-primary-foreground/20 py-4">
            <div><span className="block text-xs text-primary-foreground/60">CURRENCY</span><span className="mt-1 block text-sm font-medium">Nigerian naira</span></div>
            <div><span className="block text-xs text-primary-foreground/60">ACCESS</span><span className="mt-1 block text-sm font-medium">Admin only</span></div>
            <div><span className="block text-xs text-primary-foreground/60">RECORDS</span><span className="mt-1 block text-sm font-medium">Audit ready</span></div>
          </div>
        </div>
        <div className="relative flex items-center justify-between text-xs text-primary-foreground/65"><span>Voucher management, without the busywork.</span><span>01 / 04</span></div>
      </section>
      <section className="flex min-h-[60vh] items-center justify-center px-6 py-12 sm:px-10 lg:min-h-screen lg:px-16">
        <div className="w-full max-w-[390px]">
          <div className="mb-7 flex items-center gap-2 text-xs font-medium text-primary"><Fingerprint className="size-4" /> SECURE ADMIN SIGN-IN</div>
          <h2 className="font-display text-3xl font-semibold tracking-tight">{isReset ? "Set a new password" : isForgot ? "Reset your password" : "Welcome back"}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{isReset ? "Choose a strong password for your administrator account." : isForgot ? "Enter the admin email and we’ll send a reset link." : "Sign in with your administrator account to continue."}</p>
          <form className="mt-8 space-y-5" onSubmit={isReset ? updatePassword : isForgot ? sendReset : signIn}>
            {!isReset && <div className="space-y-2"><Label htmlFor="admin-email">Email address</Label><Input id="admin-email" autoComplete="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" required maxLength={255} /></div>}
            {mode === "signin" && <div className="space-y-2"><div className="flex items-center justify-between"><Label htmlFor="admin-password">Password</Label><Button type="button" variant="link" className="h-auto px-0 text-xs" onClick={() => setMode("forgot")}>Forgot password?</Button></div><div className="relative"><Input id="admin-password" autoComplete="current-password" type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" required maxLength={128} className="pr-11" /><Button type="button" variant="ghost" size="icon" className="absolute right-1 top-0.5" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff /> : <Eye />}</Button></div></div>}
            {isReset && <div className="space-y-2"><Label htmlFor="new-admin-password">New password</Label><div className="relative"><Input id="new-admin-password" autoComplete="new-password" type={showNewPassword ? "text" : "password"} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="At least 8 characters" required minLength={8} maxLength={128} /><Button type="button" variant="ghost" size="icon" className="absolute right-1 top-0.5" aria-label={showNewPassword ? "Hide password" : "Show password"} onClick={() => setShowNewPassword(!showNewPassword)}>{showNewPassword ? <EyeOff /> : <Eye />}</Button></div></div>}
            <Button className="h-11 w-full" type="submit" disabled={busy}>{busy ? "Please wait…" : isReset ? "Save new password" : isForgot ? "Send reset link" : "Sign in securely"}<ArrowRight className="size-4" /></Button>
          </form>
          {mode !== "signin" && <Button variant="link" className="mt-4 px-0" onClick={() => setMode("signin")}><ArrowLeft className="size-4" /> Back to sign in</Button>}
          <div className="mt-8 flex items-start gap-3 border-t pt-5 text-xs leading-5 text-muted-foreground"><LockKeyhole className="mt-0.5 size-4 shrink-0 text-primary" /><span>Registration is disabled. Admin accounts are provisioned by the workspace owner.</span></div>
          <p className="mt-7 text-center text-[11px] text-muted-foreground">Skymart · Secure gift card workspace</p>
        </div>
      </section>
    </main>
  );
}

export function GiftCardAdmin() {
  const auth = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [screen, setScreen] = useState<Screen>("dashboard");
  const [cards, setCards] = useState<CardRow[]>([]);
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [stats, setStats] = useState<DashboardStats>({ total_cards: 0, activated_cards: 0, total_active_balance: 0, total_amount_added: 0, total_amount_deducted: 0 });
  const [selectedCard, setSelectedCard] = useState<CardRow | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<TableSort>("newest");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [modal, setModal] = useState<"single" | "bulk" | Adjustment | null>(null);
  const [formBusy, setFormBusy] = useState(false);
  const [showVouchers, setShowVouchers] = useState(false);
  const [singleForm, setSingleForm] = useState({ serialNumber: "", voucherCode: "", amount: "" });
  const [amount, setAmount] = useState("");
  const [uploadDrafts, setUploadDrafts] = useState<GiftCardDraftRow[]>([]);
  const [uploadFileName, setUploadFileName] = useState("");
  const [bulkValue, setBulkValue] = useState("");
  const [passwordForm, setPasswordForm] = useState({ currentPassword: "", newPassword: "" });

  async function loadData() {
    const user = await supabase.auth.getUser();
    if (user.error || !user.data.user) { setIsAdmin(false); return; }
    const { data: authorized, error: authError } = await supabase.rpc("is_gift_card_admin");
    if (authError || !authorized) { setIsAdmin(false); return; }
    setIsAdmin(true);
    const [cardsResult, transactionsResult, statsResult] = await Promise.all([
      supabase.from("gift_cards").select("*").order("created_at", { ascending: false }).limit(1000),
      supabase.from("transactions").select("*").order("created_at", { ascending: false }).limit(1000),
      supabase.rpc("get_gift_card_dashboard_stats"),
    ]);
    const error = cardsResult.error ?? transactionsResult.error ?? statsResult.error;
    if (error) { toast.error(getErrorMessage(error, "Could not load dashboard records.")); return; }
    setCards(cardsResult.data ?? []);
    setTransactions(transactionsResult.data ?? []);
    const nextStats = statsResult.data as DashboardStats;
    setStats(nextStats);
  }

  useEffect(() => {
    if (auth.email && auth.ready) void loadData();
  }, [auth.email, auth.ready]);

  const activeCards = cards.filter((card) => card.status === "active").length;
  const filteredCards = useMemo(() => cards
    .filter((card) => statusFilter === "all" || card.status === statusFilter)
    .filter((card) => !searchTerm || card.serial_number.toLowerCase().includes(searchTerm.toLowerCase()) || card.voucher_code.toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((a, b) => sort === "largest" ? b.current_balance - a.current_balance : sort === "oldest" ? a.created_at.localeCompare(b.created_at) : b.created_at.localeCompare(a.created_at)),
  [cards, statusFilter, searchTerm, sort]);

  function goTo(next: Screen) {
    setScreen(next);
    setMobileNavOpen(false);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    setIsAdmin(false);
    setScreen("dashboard");
  }

  async function createCard(row: CsvCardRow) {
    const { error } = await supabase.rpc("create_gift_card", { p_serial_number: row.serialNumber, p_voucher_code: row.voucherCode, p_amount: row.amount });
    if (error) throw error;
  }

  async function saveSingleCard(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const numericAmount = Number(singleForm.amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0 || Math.round(numericAmount * 100) !== numericAmount * 100) { toast.error("Enter a positive amount with up to two decimal places."); return; }
    setFormBusy(true);
    const row = { serialNumber: singleForm.serialNumber.trim(), voucherCode: singleForm.voucherCode.trim(), amount: numericAmount };
    const { error } = await supabase.rpc("create_gift_card", { p_serial_number: row.serialNumber, p_voucher_code: row.voucherCode, p_amount: row.amount });
    if (error) toast.error(getErrorMessage(error, "Could not add this card."));
    else { toast.success("Gift card added and initial credit recorded."); setSingleForm({ serialNumber: "", voucherCode: "", amount: "" }); setModal(null); await loadData(); }
    setFormBusy(false);
  }

  function resolveBulkRows(): CsvCardRow[] | null {
    const trimmed = bulkValue.trim();
    const override = trimmed === "" ? null : Number(trimmed);
    if (trimmed !== "" && !isValidCardAmount(override as number)) {
      toast.error("Enter a positive card value with up to two decimal places.");
      return null;
    }
    try {
      return finalizeGiftCardRows(uploadDrafts, override);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not prepare those cards for import.");
      return null;
    }
  }

  async function saveBulkCards() {
    if (!uploadDrafts.length) return;
    const rows = resolveBulkRows();
    if (!rows) return;
    setFormBusy(true);
    let imported = 0;
    let failure = "";
    for (const row of rows) {
      const { error } = await supabase.rpc("create_gift_card", { p_serial_number: row.serialNumber, p_voucher_code: row.voucherCode, p_amount: row.amount });
      if (error) { failure = getErrorMessage(error, `Upload stopped at serial number ${row.serialNumber}.`); break; }
      imported += 1;
    }
    if (imported > 0) { toast.success(`${imported} ${imported === 1 ? "card" : "cards"} imported with an initial transaction each.`); await loadData(); }
    if (failure) toast.error(`${failure}${imported ? ` ${imported} preceding rows were saved.` : " No cards were saved."}`);
    else { setUploadDrafts([]); setUploadFileName(""); setBulkValue(""); setModal(null); }
    setFormBusy(false);
  }

  function readUploadFile(file: File | undefined) {
    if (!file) return;
    void parseGiftCardUploadFile(file)
      .then((drafts) => {
        setUploadDrafts(drafts);
        setUploadFileName(file.name);
        toast.success(`${drafts.length} ${drafts.length === 1 ? "card" : "cards"} ready to import.`);
      })
      .catch((error) => toast.error(error instanceof Error ? error.message : "Could not read that file."));
  }

  function downloadCsvTemplate() {
    const csv = "serial number,voucher code,amount\nCARD-0001,EXAMPLE-CODE-0001,10000.00\n";
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = "gift-card-upload-template.csv"; anchor.click(); URL.revokeObjectURL(url);
  }

  function resetBulkUpload() {
    setUploadDrafts([]);
    setUploadFileName("");
    setBulkValue("");
  }

  async function adjustBalance(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCard) return;
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0 || Math.round(numericAmount * 100) !== numericAmount * 100) { toast.error("Enter a positive amount with up to two decimal places."); return; }
    if (modal === "deduct" && numericAmount > selectedCard.current_balance) { toast.error("The amount cannot exceed the available balance."); return; }
    setFormBusy(true);
    const { error } = await supabase.rpc("adjust_gift_card_balance", { p_card_id: selectedCard.id, p_amount: numericAmount, p_adjustment: modal === "add" ? "add" : "deduct" });
    if (error) toast.error(getErrorMessage(error, "Could not update the card balance."));
    else { toast.success(modal === "add" ? "Money added and recorded." : "Deduction recorded."); setModal(null); setAmount(""); setSelectedCard(null); await loadData(); }
    setFormBusy(false);
  }

  async function changeCardStatus(card: CardRow, active: boolean) {
    const { error } = await supabase.rpc("set_gift_card_status", { p_card_id: card.id, p_active: active });
    if (error) toast.error(getErrorMessage(error, "Could not change the card status."));
    else { toast.success(active ? "Card activated." : "Card deactivated."); await loadData(); }
  }

  async function changePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (passwordForm.newPassword.length < 8) { toast.error("Use at least 8 characters for your new password."); return; }
    setFormBusy(true);
    const { error: verifyError } = await supabase.auth.signInWithPassword({ email: auth.email ?? "", password: passwordForm.currentPassword });
    if (verifyError) { toast.error(getAuthErrorMessage(verifyError.message)); setFormBusy(false); return; }
    const { error } = await supabase.auth.updateUser({ password: passwordForm.newPassword });
    if (error) toast.error(getAuthErrorMessage(error.message));
    else { toast.success("Password updated."); setPasswordForm({ currentPassword: "", newPassword: "" }); }
    setFormBusy(false);
  }

  function openAdjustment(card: CardRow, type: Adjustment) {
    setSelectedCard(card);
    setAmount("");
    setModal(type);
  }

  const recentCards = cards.slice(0, 5);
  const recentTransactions = transactions.slice(0, 6);
  const title = screen === "gift-cards" ? "Gift cards" : screen === "transactions" ? "Transactions" : screen === "settings" ? "Settings" : "Dashboard";

  if (!auth.ready) return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-background">
      <SkymartLogo className="px-3 py-2 shadow-sm" imgClassName="h-10" />
      <div className="flex items-center gap-3 text-muted-foreground"><span className="size-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />Preparing your secure workspace…</div>
    </div>
  );
  if (!auth.email) return <AuthScreen mode={auth.mode} setMode={auth.setMode} onAuthenticated={auth.setEmail} />;
  if (!isAdmin) return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5">
      <div className="max-w-md text-center">
        <SkymartLogo className="mx-auto mb-5 px-3 py-2 shadow-sm" imgClassName="h-10" />
        <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-md bg-destructive/10 text-destructive"><ShieldCheck className="size-7" /></div>
        <h1 className="font-display text-2xl font-semibold">Admin access required</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">This account does not have permission to manage gift cards. Contact the workspace owner if you believe this is an error.</p>
        <Button className="mt-6" variant="outline" onClick={handleSignOut}><LogOut className="size-4" /> Sign out</Button>
      </div>
    </main>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      {mobileNavOpen && <Button variant="ghost" size="icon" aria-label="Close menu" className="fixed inset-y-0 right-0 z-40 h-full w-[calc(100%-17rem)] rounded-none bg-foreground/20 backdrop-blur-[1px] lg:hidden" onClick={() => setMobileNavOpen(false)}><X className="sr-only" /></Button>}
      <aside className={cn("fixed inset-y-0 left-0 z-50 flex w-[272px] -translate-x-full flex-col border-r bg-sidebar transition-transform duration-200 lg:translate-x-0", mobileNavOpen && "translate-x-0")}>
        <div className="flex h-[72px] items-center justify-between border-b px-6">
          <div className="min-w-0 flex-1">
            <SkymartLogo className="px-2 py-1" imgClassName="h-8 max-w-[168px]" />
            <div className="mt-1 px-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Gift card operations</div>
          </div>
          <Button variant="ghost" size="icon" aria-label="Close menu" className="lg:hidden" onClick={() => setMobileNavOpen(false)}><X /></Button>
        </div>
        <div className="px-4 pt-6"><p className="px-3 text-[10px] font-semibold uppercase text-muted-foreground">Workspace</p><nav aria-label="Main navigation" className="mt-3 space-y-1">{NAV_ITEMS.map(({ id, label, icon: Icon }) => <Button key={id} variant="ghost" onClick={() => goTo(id)} aria-current={screen === id ? "page" : undefined} className={cn("h-10 w-full justify-start gap-3 rounded-md px-3 text-sm font-medium text-sidebar-foreground", screen === id && "bg-sidebar-accent text-sidebar-accent-foreground") }><Icon className={cn("size-[17px]", screen === id ? "text-primary" : "text-muted-foreground")} />{label}{id === "gift-cards" && cards.length > 0 && <span className="ml-auto rounded-full bg-sidebar-accent px-2 py-0.5 text-[10px] text-muted-foreground">{stats.total_cards}</span>}</Button>)}</nav></div>
        <div className="mx-5 mt-8 border-t" />
        <div className="mx-4 mt-5 rounded-md bg-primary p-4 text-primary-foreground"><div className="mb-3 flex items-center justify-between"><div className="flex size-8 items-center justify-center rounded-md bg-primary-foreground/15"><ShieldCheck className="size-4" /></div><span className="rounded-full bg-primary-foreground/15 px-2 py-1 text-[10px]">ACTIVE</span></div><div className="text-sm font-semibold">Admin workspace</div><p className="mt-1 text-xs leading-5 text-primary-foreground/75">Card activity and balances are protected in this workspace.</p></div>
        <div className="mt-auto border-t p-4"><div className="flex items-center gap-3"><Avatar className="size-9 rounded-md"><AvatarFallback className="rounded-md bg-accent text-xs font-semibold text-accent-foreground">{(auth.email ?? "AD").slice(0, 2).toUpperCase()}</AvatarFallback></Avatar><div className="min-w-0 flex-1"><p className="truncate text-xs font-medium">{auth.email}</p><p className="mt-0.5 text-[10px] text-muted-foreground">Administrator</p></div><Button variant="ghost" size="icon" aria-label="Sign out" title="Sign out" onClick={handleSignOut}><LogOut /></Button></div></div>
      </aside>

      <div className="min-h-screen lg:ml-[272px]">
        <header className="sticky top-0 z-30 flex h-[72px] items-center justify-between border-b bg-background/95 px-4 backdrop-blur sm:px-7 lg:px-9">
          <div className="flex items-center gap-3"><Button variant="ghost" size="icon" aria-label="Open menu" className="lg:hidden" onClick={() => setMobileNavOpen(true)}><Menu /></Button><div className="hidden text-xs text-muted-foreground sm:block">Workspace <span className="mx-2">/</span></div><h1 className="font-display text-[17px] font-semibold">{title}</h1><Badge variant="outline" className="hidden items-center gap-1 border-primary/25 bg-primary/5 text-[10px] font-medium text-primary sm:inline-flex"><span className="size-1.5 rounded-full bg-primary" />Live</Badge></div>
          <div className="flex items-center gap-2 sm:gap-3"><span className="hidden text-xs text-muted-foreground md:block">{new Intl.DateTimeFormat("en-NG", { weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(new Date())}</span><Button variant="outline" size="icon" aria-label="Refresh dashboard" title="Refresh dashboard" className="size-9" onClick={() => void loadData()}><TrendingUp className="size-4" /></Button><div className="mx-1 hidden h-7 w-px bg-border sm:block" /><Avatar className="size-8 rounded-md"><AvatarFallback className="rounded-md bg-accent text-[10px] font-semibold text-accent-foreground">{(auth.email ?? "AD").slice(0, 2).toUpperCase()}</AvatarFallback></Avatar></div>
        </header>

        <main className="mx-auto max-w-[1450px] px-4 py-6 sm:px-7 sm:py-8 lg:px-9">
          {screen === "dashboard" && <DashboardScreen stats={stats} cards={recentCards} transactions={recentTransactions} showVouchers={showVouchers} onToggleVouchers={setShowVouchers} onNavigate={goTo} onSelectCard={setSelectedCard} />}
          {screen === "gift-cards" && <CardsScreen cards={filteredCards} search={searchTerm} setSearch={setSearchTerm} status={statusFilter} setStatus={setStatusFilter} sort={sort} setSort={setSort} showVouchers={showVouchers} setShowVouchers={setShowVouchers} onAdd={() => setModal("single")} onBulk={() => { resetBulkUpload(); setModal("bulk"); }} onSelect={setSelectedCard} />}
          {screen === "transactions" && <TransactionsScreen cards={cards} transactions={transactions} />}
          {screen === "settings" && <SettingsScreen email={auth.email ?? ""} busy={formBusy} passwordForm={passwordForm} setPasswordForm={setPasswordForm} onChangePassword={changePassword} onSignOut={handleSignOut} />}
        </main>

        {screen !== "settings" && <footer className="mx-4 flex flex-col gap-2 border-t px-1 py-5 text-[11px] text-muted-foreground sm:mx-7 sm:flex-row sm:items-center sm:justify-between lg:mx-9"><span>Skymart · Gift card operations</span><span>All amounts in Nigerian naira (₦)</span></footer>}
      </div>

      <Dialog open={modal !== null} onOpenChange={(open) => { if (!open && !formBusy) { setModal(null); resetBulkUpload(); } }}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-lg">
          {modal === "single" && <><DialogHeader><div className="mb-2 flex size-10 items-center justify-center rounded-md bg-accent text-primary"><CreditCard className="size-5" /></div><DialogTitle>Add a gift card</DialogTitle><DialogDescription>Enter the card details. An initial-credit record is created automatically.</DialogDescription></DialogHeader><form className="space-y-4" onSubmit={saveSingleCard}><div className="space-y-2"><Label htmlFor="new-serial">Serial number</Label><Input id="new-serial" value={singleForm.serialNumber} onChange={(event) => setSingleForm({ ...singleForm, serialNumber: event.target.value })} placeholder="e.g. GC-2025-001" required maxLength={100} /></div><div className="space-y-2"><Label htmlFor="new-voucher">Voucher code</Label><Input id="new-voucher" value={singleForm.voucherCode} onChange={(event) => setSingleForm({ ...singleForm, voucherCode: event.target.value })} placeholder="Enter unique voucher code" required maxLength={200} autoComplete="off" /></div><div className="space-y-2"><Label htmlFor="new-amount">Initial amount (₦)</Label><Input id="new-amount" type="number" min="0.01" step="0.01" inputMode="decimal" value={singleForm.amount} onChange={(event) => setSingleForm({ ...singleForm, amount: event.target.value })} placeholder="0.00" required /></div><DialogFooter className="pt-3"><Button type="button" variant="outline" onClick={() => setModal(null)}>Cancel</Button><Button type="submit" disabled={formBusy}>{formBusy ? "Saving…" : "Add card"}<Plus className="size-4" /></Button></DialogFooter></form></>}
          {modal === "bulk" && <>
            <DialogHeader>
              <div className="mb-2 flex size-10 items-center justify-center rounded-md bg-accent text-primary"><FileUp className="size-5" /></div>
              <DialogTitle>Upload cards</DialogTitle>
              <DialogDescription>Import a CSV or Excel (.xlsx) file with serial number and voucher code. Set a card value here, or include an amount column in the file.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">CSV template</p>
                  <p className="text-xs text-muted-foreground">serial number, voucher code, amount</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={downloadCsvTemplate}><Download className="size-4" /> Download</Button>
              </div>
              <div className="space-y-2">
                <Label htmlFor="bulk-card-value">Set card value (₦)</Label>
                <Input
                  id="bulk-card-value"
                  type="number"
                  min="0.01"
                  step="0.01"
                  inputMode="decimal"
                  value={bulkValue}
                  onChange={(event) => setBulkValue(event.target.value)}
                  placeholder="e.g. 10000.00"
                />
                <p className="text-xs text-muted-foreground">
                  {uploadDrafts.some((row) => row.amount == null)
                    ? "Required when your file has no amount column. Applied to every card in this upload."
                    : "Optional. Leave blank to keep amounts from the file, or enter a value to apply it to every card."}
                </p>
              </div>
              <label htmlFor="gift-card-upload" className="flex cursor-pointer flex-col items-center justify-center rounded-md border border-dashed bg-muted/30 px-4 py-8 text-center transition-colors hover:border-primary/50">
                <span className="mb-3 flex size-11 items-center justify-center rounded-md bg-background text-primary"><FileUp className="size-5" /></span>
                <span className="text-sm font-medium">{uploadFileName || "Choose a CSV or Excel file"}</span>
                <span className="mt-1 text-xs text-muted-foreground">.csv or .xlsx · Maximum 500 rows · 5 MB</span>
                <input
                  id="gift-card-upload"
                  className="sr-only"
                  type="file"
                  accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={(event) => readUploadFile(event.target.files?.[0])}
                />
              </label>
              {uploadDrafts.length > 0 && (
                <div className="rounded-md border p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{uploadDrafts.length} cards ready</p>
                    <Badge variant="secondary"><Check className="mr-1 size-3" />Validated</Badge>
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {uploadDrafts.slice(0, 2).map((row) => row.serialNumber).join(", ")}
                    {uploadDrafts.length > 2 ? `, +${uploadDrafts.length - 2} more` : ""}
                  </p>
                </div>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => { setModal(null); resetBulkUpload(); }}>Cancel</Button>
                <Button type="button" disabled={formBusy || uploadDrafts.length === 0} onClick={() => void saveBulkCards()}>
                  {formBusy ? "Importing…" : `Import ${uploadDrafts.length || ""} cards`}
                  <ArrowRight className="size-4" />
                </Button>
              </DialogFooter>
            </div>
          </>}
          {(modal === "add" || modal === "deduct") && selectedCard && <><DialogHeader><div className={cn("mb-2 flex size-10 items-center justify-center rounded-md", modal === "add" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700")}><WalletCards className="size-5" /></div><DialogTitle>{modal === "add" ? "Add money" : "Deduct money"}</DialogTitle><DialogDescription>Update the card balance and record this adjustment.</DialogDescription></DialogHeader><form className="space-y-4" onSubmit={adjustBalance}><div className="rounded-md border bg-muted/30 p-4"><p className="text-xs text-muted-foreground">CARD SERIAL NUMBER</p><p className="mt-1 font-medium">{selectedCard.serial_number}</p><div className="mt-4 flex items-center justify-between border-t pt-3"><span className="text-xs text-muted-foreground">Available balance</span><span className="font-display text-lg font-semibold">{formatNaira(selectedCard.current_balance)}</span></div></div><div className="space-y-2"><Label htmlFor="adjustment-amount">Amount (₦)</Label><Input id="adjustment-amount" type="number" min="0.01" max={modal === "deduct" ? selectedCard.current_balance : undefined} step="0.01" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" required /></div><DialogFooter className="pt-3"><Button type="button" variant="outline" onClick={() => setModal(null)}>Cancel</Button><Button type="submit" disabled={formBusy || (modal === "deduct" && selectedCard.status !== "active")}>{formBusy ? "Saving…" : "Confirm"}{modal === "add" ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}</Button></DialogFooter></form></>}
        </DialogContent>
      </Dialog>

      <Dialog open={selectedCard !== null && modal === null} onOpenChange={(open) => { if (!open) setSelectedCard(null); }}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-xl">
          {selectedCard && <><DialogHeader><div className="mb-2 flex size-10 items-center justify-center rounded-md bg-accent text-primary"><CreditCard className="size-5" /></div><div className="flex items-center gap-2"><DialogTitle>Card details</DialogTitle><StatusBadge status={selectedCard.status} /></div><DialogDescription>Review this card and manage its balance or availability.</DialogDescription></DialogHeader><div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2"><DetailBox label="Serial number" value={selectedCard.serial_number} /><DetailBox label="Voucher code" value={showVouchers ? selectedCard.voucher_code : maskVoucherCode(selectedCard.voucher_code)} action={<Button variant="ghost" size="icon" aria-label={showVouchers ? "Hide voucher code" : "Reveal voucher code"} onClick={() => setShowVouchers(!showVouchers)}>{showVouchers ? <EyeOff /> : <Eye />}</Button>} /><DetailBox label="Initial amount" value={formatNaira(selectedCard.initial_amount)} /><DetailBox label="Current balance" value={formatNaira(selectedCard.current_balance)} /></div><DetailBox label="Date created" value={new Date(selectedCard.created_at).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })} /><div className="flex flex-col gap-2 border-t pt-4 sm:flex-row sm:flex-wrap"><Button onClick={() => openAdjustment(selectedCard, "add")}><TrendingUp className="size-4" /> Add money</Button><Button variant="outline" onClick={() => openAdjustment(selectedCard, "deduct")} disabled={selectedCard.status !== "active"}><TrendingDown className="size-4" /> Deduct</Button><div className="flex items-center gap-2 sm:ml-auto"><Switch id="card-active" checked={selectedCard.status === "active"} disabled={selectedCard.status === "depleted"} onCheckedChange={(checked) => void changeCardStatus(selectedCard, checked)} /><Label htmlFor="card-active" className="text-xs text-muted-foreground">{selectedCard.status === "depleted" ? "Depleted" : selectedCard.status === "active" ? "Active" : "Inactive"}</Label></div></div></div></>}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DashboardScreen({ stats, cards, transactions, showVouchers, onToggleVouchers, onNavigate, onSelectCard }: { stats: DashboardStats; cards: CardRow[]; transactions: TransactionRow[]; showVouchers: boolean; onToggleVouchers: (value: boolean) => void; onNavigate: (screen: Screen) => void; onSelectCard: (card: CardRow) => void }) {
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  const metricCards = [
    { label: "Total cards", value: stats.total_cards.toLocaleString("en-NG"), note: "All cards issued", icon: WalletCards, color: "bg-blue-50 text-blue-700", trend: <CreditCard className="size-4" /> },
    { label: "Activated cards", value: stats.activated_cards.toLocaleString("en-NG"), note: "Cards enabled for use", icon: Check, color: "bg-emerald-50 text-emerald-700", trend: <ArrowUpRight className="size-4" /> },
    { label: "Total active balance", value: formatNaira(stats.total_active_balance), note: "Available on active cards", icon: WalletCards, color: "bg-violet-50 text-violet-700", trend: <ArrowDownLeft className="size-4" /> },
    { label: "Total amount added", value: formatNaira(stats.total_amount_added), note: "Lifetime card credits", icon: TrendingUp, color: "bg-cyan-50 text-cyan-700", trend: <TrendingUp className="size-4" /> },
    { label: "Total deducted", value: formatNaira(stats.total_amount_deducted), note: "Lifetime deductions", icon: TrendingDown, color: "bg-amber-50 text-amber-700", trend: <TrendingDown className="size-4" /> },
  ];
  return <div className="space-y-7"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-xs font-medium uppercase text-primary">Your operations, at a glance</p><h2 className="mt-2 font-display text-2xl font-semibold">Good day, admin <span className="text-xl">✦</span></h2><p className="mt-1.5 text-sm text-muted-foreground">Here’s what’s happening with your gift cards.</p></div><div className="flex gap-2"><Button variant="outline" onClick={() => onNavigate("transactions")}><BarChart3 className="size-4" />Transactions</Button><Button onClick={() => onNavigate("gift-cards")}><Plus className="size-4" />Add a card</Button></div></div>
    <section aria-label="Dashboard statistics" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{metricCards.map(({ label, value, note, icon: Icon, color, trend }) => <Card key={label} className="rounded-md border bg-card shadow-none"><CardContent className="p-4 sm:p-[18px]"><div className="flex items-center justify-between"><span className="text-xs font-medium text-muted-foreground">{label}</span><span className={cn("flex size-8 items-center justify-center rounded-md", color)}><Icon className="size-4" /></span></div><p className="mt-4 truncate font-display text-[22px] font-semibold leading-none">{value}</p><div className="mt-3 flex items-center justify-between text-[10px] text-muted-foreground"><span className="truncate">{note}</span><span className="ml-2 text-muted-foreground/70">{trend}</span></div></CardContent></Card>)}</section>
    <section className="grid gap-5 xl:grid-cols-[1.45fr_1fr]"><Card className="overflow-hidden rounded-md border shadow-none"><div className="flex items-center justify-between border-b px-5 py-4"><div className="flex items-center gap-3"><div className="flex size-9 items-center justify-center rounded-md bg-accent text-primary"><CreditCard className="size-[17px]" /></div><div><h3 className="text-sm font-semibold">Recently added cards</h3><p className="mt-0.5 text-xs text-muted-foreground">The latest cards in your workspace</p></div></div><Button variant="ghost" size="sm" onClick={() => onNavigate("gift-cards")}>View all <ArrowRight className="size-3.5" /></Button></div>{cards.length === 0 ? <EmptyState title="No cards have been added" body="Add a gift card to see it listed here." icon={WalletCards} action={<Button size="sm" onClick={() => onNavigate("gift-cards")}><Plus className="size-4" />Add a card</Button>} /> : <div className="overflow-x-auto"><table className="w-full min-w-[570px] text-left"><thead><tr className="border-b bg-muted/40 text-[10px] font-medium uppercase text-muted-foreground"><th className="px-5 py-3">Serial number</th><th className="px-4 py-3">Voucher code</th><th className="px-4 py-3">Balance</th><th className="px-4 py-3">Status</th></tr></thead><tbody>{cards.map((card) => <tr key={card.id} className="border-b last:border-b-0 hover:bg-muted/20"><td className="px-5 py-3.5"><Button variant="link" className="h-auto px-0 text-xs font-medium" onClick={() => onSelectCard(card)}>{card.serial_number}</Button></td><td className="px-4 py-3.5 font-mono text-[11px] text-muted-foreground">{showVouchers ? card.voucher_code : maskVoucherCode(card.voucher_code)}</td><td className="px-4 py-3.5 text-xs font-medium">{formatNaira(card.current_balance)}</td><td className="px-4 py-3.5"><StatusBadge status={card.status} /></td></tr>)}</tbody></table></div>}<div className="flex items-center justify-between border-t bg-muted/20 px-5 py-3 text-[11px]"><span className="text-muted-foreground">Showing {cards.length} recent {cards.length === 1 ? "card" : "cards"}</span><span className="flex items-center gap-1 text-emerald-700"><span className="size-1.5 rounded-full bg-emerald-600" />{stats.total_cards} total issued</span></div></Card>
      <Card className="overflow-hidden rounded-md border shadow-none"><div className="flex items-center justify-between border-b px-5 py-4"><div className="flex items-center gap-3"><div className="flex size-9 items-center justify-center rounded-md bg-violet-50 text-violet-700"><TrendingUp className="size-[17px]" /></div><div><h3 className="text-sm font-semibold">Recent transactions</h3><p className="mt-0.5 text-xs text-muted-foreground">A record of every card adjustment</p></div></div><Button variant="ghost" size="icon" title="View all transactions" aria-label="View all transactions" onClick={() => onNavigate("transactions")}><ArrowRight /></Button></div>{transactions.length === 0 ? <EmptyState title="Nothing to show yet" body="Card credits and adjustments will appear here." icon={BarChart3} /> : <div className="divide-y">{transactions.map((transaction) => { const card = cardsById.get(transaction.gift_card_id); const isDeduction = transaction.transaction_type === "money_deducted"; return <div key={transaction.id} className="flex items-center gap-3 px-5 py-3.5"><span className={cn("flex size-9 shrink-0 items-center justify-center rounded-md", isDeduction ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700")}>{isDeduction ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}</span><div className="min-w-0 flex-1"><p className="truncate text-xs font-medium">{transaction.transaction_type === "initial_credit" ? "Initial credit" : isDeduction ? "Money deducted" : "Money added"}</p><p className="mt-1 truncate text-[10px] text-muted-foreground">{card?.serial_number ?? "Gift card"} · {new Date(transaction.created_at).toLocaleString("en-NG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p></div><span className={cn("whitespace-nowrap text-xs font-semibold", isDeduction ? "text-rose-700" : "text-emerald-700")}>{isDeduction ? "−" : "+"}{formatNaira(transaction.amount)}</span></div>; })}</div>}<div className="border-t px-5 py-3"><Button variant="link" className="h-auto px-0 text-xs" onClick={() => onNavigate("transactions")}>Open transaction history<ArrowRight className="size-3.5" /></Button></div></Card></section>
    <section className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]"><div className="rounded-md border bg-primary/[0.035] p-5 sm:p-6"><div className="flex items-start justify-between gap-4"><div className="flex items-start gap-3"><span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md bg-amber-50 text-amber-700"><Sparkles className="size-4" /></span><div><p className="text-sm font-semibold">A clear view of your card program</p><p className="mt-1.5 max-w-xl text-xs leading-5 text-muted-foreground">Balances and totals are calculated from your card and transaction records, with voucher codes masked in the tables.</p></div></div><Button variant="outline" size="sm" className="hidden shrink-0 bg-background sm:inline-flex" onClick={() => onNavigate("gift-cards")}>Manage cards<ArrowRight /></Button></div></div><div className="flex items-center justify-between gap-4 rounded-md border bg-card p-5"><div className="flex items-center gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-700"><ShieldCheck className="size-4" /></span><div><p className="text-sm font-semibold">Protected by admin access</p><p className="mt-1 text-xs text-muted-foreground">Sign-up is disabled</p></div></div><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-medium text-emerald-700">SECURE</span></div></section>
  </div>;
}

function CardsScreen({ cards, search, setSearch, status, setStatus, sort, setSort, showVouchers, setShowVouchers, onAdd, onBulk, onSelect }: { cards: CardRow[]; search: string; setSearch: (value: string) => void; status: StatusFilter; setStatus: (value: StatusFilter) => void; sort: TableSort; setSort: (value: TableSort) => void; showVouchers: boolean; setShowVouchers: (value: boolean) => void; onAdd: () => void; onBulk: () => void; onSelect: (card: CardRow) => void }) {
  return <div className="space-y-6"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-xs font-medium uppercase text-primary">Card inventory</p><h2 className="mt-2 font-display text-2xl font-semibold">Gift cards</h2><p className="mt-1.5 text-sm text-muted-foreground">Manage your cards, voucher codes and available balances.</p></div><div className="flex gap-2"><Button variant="outline" onClick={onBulk}><FileUp className="size-4" />Bulk upload</Button><Button onClick={onAdd}><Plus className="size-4" />Add card</Button></div></div>
    <div className="flex flex-col gap-3 rounded-md border bg-card p-3 sm:flex-row sm:items-center"><div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Search serial number or voucher code" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search serial or voucher code" className="pl-9" /></div><div className="flex flex-wrap items-center gap-2"><Select value={status} onValueChange={(value) => setStatus(value as StatusFilter)}><SelectTrigger aria-label="Filter by card status" className="w-[150px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem><SelectItem value="depleted">Depleted</SelectItem></SelectContent></Select><Select value={sort} onValueChange={(value) => setSort(value as TableSort)}><SelectTrigger aria-label="Sort cards" className="w-[150px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="newest">Newest first</SelectItem><SelectItem value="oldest">Oldest first</SelectItem><SelectItem value="largest">Largest balance</SelectItem></SelectContent></Select><Button type="button" variant="outline" size="icon" aria-label={showVouchers ? "Hide voucher codes" : "Reveal voucher codes"} title={showVouchers ? "Hide voucher codes" : "Reveal voucher codes"} onClick={() => setShowVouchers(!showVouchers)}>{showVouchers ? <EyeOff /> : <Eye />}</Button></div></div>
    <Card className="overflow-hidden rounded-md border shadow-none"><div className="flex items-center justify-between border-b px-5 py-4"><div><h3 className="text-sm font-semibold">All gift cards</h3><p className="mt-0.5 text-xs text-muted-foreground">{cards.length.toLocaleString("en-NG")} {cards.length === 1 ? "card" : "cards"} match your filters</p></div><span className="flex items-center gap-1 text-[10px] text-muted-foreground"><ShieldCheck className="size-3.5 text-primary" /> Codes masked by default</span></div>{cards.length === 0 ? <EmptyState title="No cards match this view" body="Try a different search or status filter, or add a card." icon={WalletCards} action={<Button size="sm" onClick={onAdd}><Plus className="size-4" />Add a card</Button>} /> : <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left"><thead><tr className="border-b bg-muted/40 text-[10px] font-medium uppercase text-muted-foreground"><th className="px-5 py-3">Serial number</th><th className="px-4 py-3">Voucher code</th><th className="px-4 py-3">Initial amount</th><th className="px-4 py-3">Current balance</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Created</th><th className="px-4 py-3"><span className="sr-only">Actions</span></th></tr></thead><tbody>{cards.map((card) => <tr key={card.id} className="border-b last:border-b-0 hover:bg-muted/20"><td className="px-5 py-3.5"><Button variant="link" className="h-auto px-0 text-xs font-medium" onClick={() => onSelect(card)}>{card.serial_number}</Button></td><td className="px-4 py-3.5 font-mono text-[11px] text-muted-foreground">{showVouchers ? card.voucher_code : maskVoucherCode(card.voucher_code)}</td><td className="px-4 py-3.5 text-xs">{formatNaira(card.initial_amount)}</td><td className="px-4 py-3.5 text-xs font-semibold">{formatNaira(card.current_balance)}</td><td className="px-4 py-3.5"><StatusBadge status={card.status} /></td><td className="px-4 py-3.5 text-xs text-muted-foreground">{new Date(card.created_at).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}</td><td className="px-4 py-3.5"><Button variant="ghost" size="icon" className="size-8" title="View card details" aria-label={`View ${card.serial_number} details`} onClick={() => onSelect(card)}><MoreHorizontal /></Button></td></tr>)}</tbody></table></div>}</Card>
  </div>;
}

function TransactionsScreen({ cards, transactions }: { cards: CardRow[]; transactions: TransactionRow[] }) {
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  return <div className="space-y-6"><div><p className="text-xs font-medium uppercase text-primary">Immutable activity log</p><h2 className="mt-2 font-display text-2xl font-semibold">Transactions</h2><p className="mt-1.5 text-sm text-muted-foreground">Every card issue and balance adjustment is recorded here.</p></div><Card className="overflow-hidden rounded-md border shadow-none"><div className="flex items-center justify-between border-b px-5 py-4"><div><h3 className="text-sm font-semibold">Transaction history</h3><p className="mt-0.5 text-xs text-muted-foreground">Records cannot be edited or removed.</p></div><Badge variant="outline" className="text-[10px]">{transactions.length.toLocaleString("en-NG")} records</Badge></div>{transactions.length === 0 ? <EmptyState title="No transactions yet" body="Initial card credits and future adjustments will appear here." icon={BarChart3} /> : <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-left"><thead><tr className="border-b bg-muted/40 text-[10px] font-medium uppercase text-muted-foreground"><th className="px-5 py-3">Transaction reference</th><th className="px-4 py-3">Card serial</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3">Previous</th><th className="px-4 py-3">New balance</th><th className="px-4 py-3">Date &amp; time</th></tr></thead><tbody>{transactions.map((transaction) => { const isDeduction = transaction.transaction_type === "money_deducted"; return <tr key={transaction.id} className="border-b last:border-b-0 hover:bg-muted/20"><td className="px-5 py-3.5 font-mono text-[11px] text-primary">{transaction.transaction_reference}</td><td className="px-4 py-3.5 text-xs font-medium">{cardsById.get(transaction.gift_card_id)?.serial_number ?? "—"}</td><td className="px-4 py-3.5"><span className="inline-flex items-center gap-2 text-xs"><span className={cn("flex size-6 items-center justify-center rounded", isDeduction ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700")}>{isDeduction ? <ArrowDownLeft className="size-3" /> : <ArrowUpRight className="size-3" />}</span>{transaction.transaction_type === "initial_credit" ? "Initial credit" : isDeduction ? "Money deducted" : "Money added"}</span></td><td className={cn("px-4 py-3.5 text-xs font-semibold", isDeduction ? "text-rose-700" : "text-emerald-700")}>{isDeduction ? "−" : "+"}{formatNaira(transaction.amount)}</td><td className="px-4 py-3.5 text-xs text-muted-foreground">{formatNaira(transaction.previous_balance)}</td><td className="px-4 py-3.5 text-xs font-semibold">{formatNaira(transaction.new_balance)}</td><td className="px-4 py-3.5 text-xs text-muted-foreground">{new Date(transaction.created_at).toLocaleString("en-NG", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</td></tr>; })}</tbody></table></div>}</Card></div>;
}

function SettingsScreen({ email, busy, passwordForm, setPasswordForm, onChangePassword, onSignOut }: { email: string; busy: boolean; passwordForm: { currentPassword: string; newPassword: string }; setPasswordForm: (value: { currentPassword: string; newPassword: string }) => void; onChangePassword: (event: React.FormEvent<HTMLFormElement>) => void; onSignOut: () => void }) {
  return <div className="mx-auto max-w-[900px] space-y-7"><div><p className="text-xs font-medium uppercase text-primary">Workspace preferences</p><h2 className="mt-2 font-display text-2xl font-semibold">Settings</h2><p className="mt-1.5 text-sm text-muted-foreground">Manage your administrator account.</p></div><section className="space-y-5"><div><h3 className="text-sm font-semibold">Admin account</h3><p className="mt-1 text-xs text-muted-foreground">Your workspace access details.</p></div><div className="grid gap-3 sm:grid-cols-2"><DetailBox label="Email address" value={email} /><DetailBox label="Access level" value="Administrator" /></div></section><section className="border-t pt-6"><div><h3 className="text-sm font-semibold">Change password</h3><p className="mt-1 text-xs text-muted-foreground">Confirm your current password before changing it.</p></div><form className="mt-5 grid max-w-2xl gap-4 sm:grid-cols-2" onSubmit={onChangePassword}><div className="space-y-2"><Label htmlFor="current-password">Current password</Label><Input id="current-password" autoComplete="current-password" type="password" value={passwordForm.currentPassword} onChange={(event) => setPasswordForm({ ...passwordForm, currentPassword: event.target.value })} required maxLength={128} /></div><div className="space-y-2"><Label htmlFor="settings-new-password">New password</Label><Input id="settings-new-password" autoComplete="new-password" type="password" value={passwordForm.newPassword} onChange={(event) => setPasswordForm({ ...passwordForm, newPassword: event.target.value })} required minLength={8} maxLength={128} /></div><div className="sm:col-span-2"><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Update password"}<LockKeyhole className="size-4" /></Button></div></form></section><section className="flex flex-col justify-between gap-4 border-t pt-6 sm:flex-row sm:items-center"><div><h3 className="text-sm font-semibold">Sign out</h3><p className="mt-1 text-xs text-muted-foreground">End your administrator session on this device.</p></div><Button variant="outline" onClick={onSignOut}><LogOut className="size-4" />Sign out</Button></section></div>;
}

function StatusBadge({ status }: { status: string }) {
  const styles = status === "active" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : status === "inactive" ? "border-slate-200 bg-slate-100 text-slate-600" : "border-amber-200 bg-amber-50 text-amber-700";
  return <Badge variant="outline" className={cn("gap-1 px-2 py-0.5 text-[10px] font-medium capitalize", styles)}><span className={cn("size-1.5 rounded-full", status === "active" ? "bg-emerald-600" : status === "inactive" ? "bg-slate-500" : "bg-amber-600")} />{status}</Badge>;
}

function DetailBox({ label, value, action }: { label: string; value: string; action?: React.ReactNode }) {
  return <div className="flex min-w-0 items-center justify-between rounded-md border bg-muted/20 px-3.5 py-3"><div className="min-w-0"><p className="text-[10px] uppercase text-muted-foreground">{label}</p><p className="mt-1 break-all text-sm font-medium">{value}</p></div>{action}</div>;
}

function EmptyState({ title, body, icon: Icon, action }: { title: string; body: string; icon: typeof WalletCards; action?: React.ReactNode }) {
  return <div className="flex min-h-[220px] flex-col items-center justify-center px-6 py-8 text-center"><span className="mb-3 flex size-10 items-center justify-center rounded-md bg-muted text-muted-foreground"><Icon className="size-5" /></span><h4 className="text-sm font-medium">{title}</h4><p className="mt-1 max-w-xs text-xs leading-5 text-muted-foreground">{body}</p>{action && <div className="mt-4">{action}</div>}</div>;
}