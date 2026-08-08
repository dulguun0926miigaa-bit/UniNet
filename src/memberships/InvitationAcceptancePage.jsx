import { useState } from "react";
import { CheckCircle2, ShieldCheck } from "lucide-react";
import { membershipService } from "./membershipService.js";

const fieldClass = "mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 disabled:bg-slate-100";

export default function InvitationAcceptancePage({ GlobalStyles, onGoToLogin }) {
  const [token] = useState(() => new URLSearchParams(window.location.search).get("token") || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [accepted, setAccepted] = useState(null);

  const submit = async event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") || "");
    const confirmPassword = String(form.get("confirmPassword") || "");
    if (password !== confirmPassword) {
      setError("Нууц үг давталт тохирохгүй байна.");
      return;
    }
    setBusy(true); setError("");
    try {
      const result = await membershipService.acceptInvitation({
        token,
        firstName: String(form.get("firstName") || "").trim(),
        lastName: String(form.get("lastName") || "").trim(),
        password,
        confirmPassword,
      });
      setAccepted(result.user);
      window.history.replaceState({}, "", "/accept-invitation?accepted=1");
    } catch (failure) {
      setError(failure.message || "Урилгыг хүлээн авч чадсангүй.");
    } finally { setBusy(false); }
  };

  return (
    <main className="font-body flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-violet-50 px-4 py-10 text-slate-900">
      {GlobalStyles && <GlobalStyles />}
      <section className="w-full max-w-xl overflow-hidden rounded-3xl border border-white/80 bg-white shadow-2xl shadow-blue-900/10" aria-labelledby="invitation-title">
        <div className="border-b border-slate-100 bg-slate-900 px-6 py-7 text-white sm:px-8">
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-white/10"><ShieldCheck aria-hidden="true" size={24} /></div>
          <p className="text-xs font-bold uppercase tracking-wider text-blue-300">Secure membership invitation</p>
          <h1 id="invitation-title" className="font-display mt-2 text-2xl font-bold">UniNet урилга хүлээн авах</h1>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-300">Нэр, нууц үгээ үүсгэснээр таны сургуулийн баталгаажсан workspace-д холбогдоно.</p>
        </div>

        <div className="p-6 sm:p-8">
          {accepted ? (
            <div className="text-center" role="status">
              <CheckCircle2 aria-hidden="true" className="mx-auto text-emerald-600" size={52} />
              <h2 className="font-display mt-5 text-xl font-bold">Урилга амжилттай баталгаажлаа</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-500"><b>{accepted.email}</b> хаягтай {accepted.role} эрх үүслээ. Одоо шинэ нууц үгээрээ нэвтэрнэ үү.</p>
              <button type="button" onClick={onGoToLogin} className="mt-6 w-full rounded-xl bg-slate-900 px-5 py-3.5 text-sm font-bold text-white transition hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-900/20">Нэвтрэх хэсэг рүү очих</button>
            </div>
          ) : !token ? (
            <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-5">
              <h2 className="font-display font-bold text-rose-800">Урилгын холбоос дутуу байна</h2>
              <p className="mt-2 text-sm leading-relaxed text-rose-700">Имэйлээр ирсэн бүрэн холбоосыг нээнэ үү. Холбоос хугацаа дууссан бол сургуулийн админаасаа дахин урилга хүсээрэй.</p>
              <button type="button" onClick={onGoToLogin} className="mt-5 rounded-xl border border-rose-200 bg-white px-4 py-3 text-xs font-bold text-rose-700">Нэвтрэх хэсэг рүү буцах</button>
            </div>
          ) : (
            <form onSubmit={submit}>
              {error && <div role="alert" className="mb-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm leading-relaxed text-rose-700">{error}</div>}
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-xs font-bold text-slate-700">Овог *<input name="lastName" required maxLength={80} autoComplete="family-name" autoFocus className={fieldClass} /></label>
                <label className="text-xs font-bold text-slate-700">Нэр *<input name="firstName" required maxLength={80} autoComplete="given-name" className={fieldClass} /></label>
                <label className="text-xs font-bold text-slate-700 sm:col-span-2">Нууц үг *<input name="password" type="password" required minLength={12} autoComplete="new-password" aria-describedby="invitation-password-help" className={fieldClass} /><span id="invitation-password-help" className="mt-2 block text-[10px] leading-relaxed text-slate-500">12+ тэмдэгт, том/жижиг үсэг, тоо болон тусгай тэмдэгт агуулна.</span></label>
                <label className="text-xs font-bold text-slate-700 sm:col-span-2">Нууц үг давтах *<input name="confirmPassword" type="password" required minLength={12} autoComplete="new-password" className={fieldClass} /></label>
              </div>
              <button type="submit" disabled={busy} className="mt-6 w-full rounded-xl bg-blue-600 px-5 py-3.5 text-sm font-bold text-white transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-50">{busy ? "Баталгаажуулж байна..." : "Урилгыг хүлээн авах"}</button>
              <p className="mt-4 text-center text-[10px] leading-relaxed text-slate-400">Урилгын токен серверт hash хэлбэрээр хадгалагддаг бөгөөд зөвхөн нэг удаа ашиглагдана.</p>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
