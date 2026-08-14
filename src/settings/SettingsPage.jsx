import { useCallback, useEffect, useMemo, useState } from "react";
import { ConfirmDialog, ErrorState, LoadingSkeleton, PageHeader, Toast } from "../student/StudentUI";
import { settingsService } from "./settingsService";
import { authService } from "../auth/authService.js";
import { applyUiPreferences, formatDate, formatDateTime } from "./uiPreferences.js";

const sections = [
  ["account", "Бүртгэл"], ["security", "Аюулгүй байдал"], ["notifications", "Мэдэгдэл"], ["privacy", "Нууцлал ба зөвшөөрөл"],
  ["appearance", "Харагдах байдал"], ["locale", "Хэл ба бүс"], ["accessibility", "Хүртээмж"], ["devices", "Идэвхтэй төхөөрөмжүүд"], ["data", "Өгөгдөл ба бүртгэл"],
  ["help", "Help"], ["feedback", "Send feedback"],
];

const fieldClass = "mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus-visible:border-blue-500 focus-visible:ring-4 focus-visible:ring-blue-500/10 disabled:bg-slate-50 disabled:text-slate-400";
const labelClass = "block text-xs font-bold text-slate-700";

const helpArticles = [
  {
    title: "Бүртгэл болон нэвтрэлт",
    paragraphs: [
      "Student хэрэглэгч баталгаажсан сургуулийн домэйнтэй имэйлээр бүртгүүлж, имэйлээр ирсэн кодоо баталгаажуулсны дараа нэвтэрнэ. Staff болон Admin эрхийг сургуулийн админ эсвэл Platform Admin олгоно.",
      "Нууц үгээ мартсан бол нэвтрэх цонхны “Нууц үг мартсан” холбоосоор баталгаажсан Gmail эсвэл сургуулийн имэйлдээ OTP авч шинэчилнэ. Google account холбоотой бол Google нэвтрэлтийг мөн ашиглаж болно.",
    ],
  },
  {
    title: "Арга хэмжээнд бүртгүүлэх",
    paragraphs: [
      "Student dashboard-ийн Арга хэмжээ хэсгээс event-ээ сонгож, хуваалцах мэдээллийн зөвшөөрлийг баталгаажуулан бүртгүүлнэ. Суудал дүүрсэн бол waitlist-д дарааллаар орно.",
      "Төлбөртэй event дээр Stripe төлбөр амжилттай баталгаажсаны дараа л QR тасалбар үүснэ. QR тасалбарыг event дээр Staff-д үзүүлэхэд UniNet сервер token hash-ийг шалгаж ирцийг бүртгэнэ.",
    ],
  },
  {
    title: "Өргөдлийн төлөв хянах",
    paragraphs: [
      "Internship, Job эсвэл Research боломж дээр CV, cover note болон шаардлагатай зөвшөөрлөө оруулж өргөдөл илгээнэ. Миний өргөдлүүд хэсэгт SUBMITTED, UNDER_REVIEW, SHORTLISTED, ACCEPTED эсвэл REJECTED төлөв харагдана.",
      "Timeline товчоор төлөв бүр хэзээ, ямар тайлбартай өөрчлөгдсөнийг харж болно. Өргөдлөө буцаан татвал холбогдох CV хуваалцах зөвшөөрөл мөн цуцлагдана.",
    ],
  },
  {
    title: "Нууцлал ба аюулгүй байдал",
    paragraphs: [
      "Нууцлал хэсэгт profile visibility, CV sharing болон recommendation preference-ээ хадгална. Consent history хүснэгтээс ямар байгууллагад, ямар зорилгоор мэдээлэл хуваалцсаныг шалгаж болно.",
      "Аюулгүй байдал хэсэгт нууц үг солих, Admin MFA тохируулах, recovery code шинэчлэх боломжтой. Идэвхтэй төхөөрөмжүүдээс танихгүй session-ийг гаргах эсвэл бүх session-ийг нэг дор хүчингүй болгоно.",
    ],
  },
];

function Toggle({ label, checked, onChange, description }) {
  return <label className="flex items-center justify-between gap-4 border-b border-slate-100 py-3"><span><span className="block text-sm font-semibold">{label}</span>{description && <span className="mt-1 block text-xs text-slate-400">{description}</span>}</span><input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} className="h-4 w-4" /></label>;
}

export default function SettingsPage({ user, onLogout }) {
  const [active, setActive] = useState(() => window.sessionStorage.getItem("uninet-settings-section") || "account");
  const [settings, setSettings] = useState(null);
  const [initial, setInitial] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [confirm, setConfirm] = useState(null);
  const [passwords, setPasswords] = useState({ current: "", next: "", repeat: "" });
  const [inlineErrors, setInlineErrors] = useState({});
  const [googlePassword, setGooglePassword] = useState("");
  const [unlinkingGoogle, setUnlinkingGoogle] = useState(false);
  const [mfaSetup, setMfaSetup] = useState(null);
  const [mfaPassword, setMfaPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState([]);
  const [newEmail, setNewEmail] = useState("");
  const [requestingEmailChange, setRequestingEmailChange] = useState(false);
  const isAdminMfaRole = ["UNIVERSITY_ADMIN", "PLATFORM_SUPER_ADMIN"].includes(user?.role);

  useEffect(() => {
    window.sessionStorage.removeItem("uninet-settings-section");
    const selectSection = event => {
      if (sections.some(([value]) => value === event.detail)) setActive(event.detail);
    };
    window.addEventListener("uninet:settings-section", selectSection);
    return () => window.removeEventListener("uninet:settings-section", selectSection);
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const result = await settingsService.get();
      setSettings(result);
      setInitial(structuredClone(result));
      applyUiPreferences(result, { persist: true });
    }
    catch (reason) { setError(reason.message || "Мэдээллийг ачаалж чадсангүй."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { const timer = setTimeout(load, 0); return () => clearTimeout(timer); }, [load]);
  useEffect(() => {
    if (settings?.appearance && settings?.locale && settings?.accessibility) applyUiPreferences(settings, { persist: false });
  }, [settings]);
  const dirty = useMemo(() => settings && initial && JSON.stringify(settings) !== JSON.stringify(initial), [initial, settings]);
  useEffect(() => {
    const warn = event => { if (dirty) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const update = (section, key, value) => setSettings(current => ({ ...current, [section]: { ...current[section], [key]: value } }));
  const changeSection = section => {
    if (dirty && !window.confirm("Хадгалаагүй өөрчлөлт байна. Үргэлжлүүлэх үү?")) return;
    setActive(section);
  };
  const validate = () => {
    const errors = {};
    if (active === "account") {
      if (!settings.account.firstName.trim()) errors.firstName = "Нэр заавал оруулна.";
      if (!settings.account.lastName.trim()) errors.lastName = "Овог заавал оруулна.";
      if (settings.account.phone && !/^\d{8}$/.test(settings.account.phone)) errors.phone = "Утас 8 оронтой байна.";
    }
    if (active === "security" && (passwords.current || passwords.next || passwords.repeat)) {
      if (!passwords.current) errors.current = "Одоогийн нууц үг шаардлагатай.";
      if (passwords.next.length < 12) errors.next = "Шинэ нууц үг хамгийн багадаа 12 тэмдэгт.";
      else if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/.test(passwords.next)) errors.next = "Том, жижиг үсэг, тоо болон тусгай тэмдэг оруулна уу.";
      if (passwords.next !== passwords.repeat) errors.repeat = "Нууц үг таарахгүй байна.";
    }
    setInlineErrors(errors);
    return Object.keys(errors).length === 0;
  };
  const createStepUp = async () => {
    const currentPassword = window.prompt("Энэ өндөр эрсдэлтэй үйлдлийг баталгаажуулахын тулд одоогийн нууц үгээ оруулна уу:");
    if (!currentPassword) throw new Error("Step-up баталгаажуулалт цуцлагдлаа.");
    const code = isAdminMfaRole && settings?.security?.mfaEnabled
      ? window.prompt("Authenticator эсвэл recovery code оруулна уу:")
      : "";
    if (isAdminMfaRole && settings?.security?.mfaEnabled && !code) throw new Error("MFA код шаардлагатай.");
    const result = await authService.createStepUp(currentPassword, code || "");
    return result.stepUpToken;
  };

  const startMfa = async () => {
    if (!mfaPassword) return setToast("MFA идэвхжүүлэхийн тулд одоогийн нууц үгээ оруулна уу.");
    try {
      const result = await authService.startMfaEnrollment(mfaPassword);
      setMfaSetup(result);
      setRecoveryCodes([]);
      setToast("Authenticator app-аар QR кодыг уншуулж 6 оронтой кодоо баталгаажуулна уу.");
    } catch (reason) { setToast(reason.message || "MFA setup эхлүүлж чадсангүй."); }
  };

  const confirmMfa = async () => {
    try {
      const result = await authService.confirmMfaEnrollment(mfaSetup?.setupToken, mfaCode);
      setRecoveryCodes(result.recoveryCodes || []);
      setMfaSetup(null);
      setMfaCode("");
      setMfaPassword("");
      await load();
      setToast("MFA амжилттай идэвхжлээ. Recovery code-уудаа хадгална уу.");
    } catch (reason) { setToast(reason.message || "MFA код буруу байна."); }
  };

  const regenerateRecoveryCodes = async () => {
    try {
      const result = await authService.regenerateMfaRecoveryCodes(mfaPassword, mfaCode);
      setRecoveryCodes(result.recoveryCodes || []);
      setMfaCode("");
      setToast("Recovery code-ууд шинэчлэгдлээ.");
    } catch (reason) { setToast(reason.message || "Recovery code шинэчилж чадсангүй."); }
  };

  const disableMfa = async () => {
    try {
      await authService.disableMfa(mfaPassword, mfaCode);
      setToast("MFA идэвхгүй боллоо. Дахин нэвтэрнэ үү.");
      await onLogout();
    } catch (reason) { setToast(reason.message || "MFA идэвхгүй болгож чадсангүй."); }
  };

  const save = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const stepUpToken = active === "security" && passwords.next ? await createStepUp() : "";
      const result = await settingsService.save(active, active === "security" ? { ...passwords, twoFactor: settings.security.twoFactor } : settings[active], stepUpToken);
      const savedSettings = result?.settings || settings;
      setSettings(savedSettings);
      setInitial(structuredClone(savedSettings));
      applyUiPreferences(savedSettings, { persist: true });
      if (active === "security") setPasswords({ current: "", next: "", repeat: "" });
      setToast(active === "security" ? "Нууц үг солигдож, бусад төхөөрөмжийн session хүчингүй боллоо." : "Тохиргоо амжилттай хадгалагдлаа.");
      setInlineErrors({});
    }
    catch (reason) { setToast(reason.message || "Тохиргоог хадгалж чадсангүй."); }
    finally { setSaving(false); }
  };
  const cancel = () => { setSettings(structuredClone(initial)); applyUiPreferences(initial, { persist: true }); setPasswords({ current: "", next: "", repeat: "" }); setInlineErrors({}); };
  const passwordStrength = passwords.next.length >= 12 && /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/.test(passwords.next) ? 100 : passwords.next.length >= 8 ? 55 : passwords.next.length >= 4 ? 25 : 0;
  const download = async kind => {
    try {
      const stepUpToken = await createStepUp();
      const result = await settingsService.download(kind, stepUpToken);
      setToast(`${result.filename} татагдлаа.`);
    } catch (reason) {
      setToast(reason.message || "Файл татаж чадсангүй.");
    }
  };
  const unlinkGoogle = async () => {
    if (!googlePassword) return setToast("Google холбоос салгахын тулд одоогийн нууц үгээ оруулна уу.");
    setUnlinkingGoogle(true);
    try {
      await authService.unlinkGoogle(googlePassword);
      setToast("Google холбоос салгагдлаа. Дахин нэвтэрнэ үү.");
      await onLogout();
    } catch (reason) {
      setToast(reason.message || "Google холбоос салгаж чадсангүй.");
    } finally {
      setUnlinkingGoogle(false);
      setGooglePassword("");
    }
  };

  const requestEmailChange = async () => {
    const normalized = newEmail.trim().toLowerCase();
    if (!normalized) return setToast("Шинэ сургуулийн email оруулна уу.");
    setRequestingEmailChange(true);
    try {
      const stepUpToken = await createStepUp();
      const result = await authService.requestEmailChange(normalized, stepUpToken);
      setNewEmail("");
      setToast(result.message || "Шинэ email хаяг руу баталгаажуулах холбоос илгээлээ.");
    } catch (reason) {
      setToast(reason.message || "Email солих хүсэлт илгээж чадсангүй.");
    } finally {
      setRequestingEmailChange(false);
    }
  };

  const sendFeedback = async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setSaving(true);
    try {
      await settingsService.sendFeedback({
        type: formData.get("type"),
        title: formData.get("title"),
        details: formData.get("details"),
      });
      form.reset();
      setToast("Санал хүсэлт амжилттай илгээгдлээ.");
    } catch (reason) {
      setToast(reason.message || "Санал хүсэлт илгээж чадсангүй.");
    } finally {
      setSaving(false);
    }
  };
  const confirmAction = async () => {
    const selected = confirm;
    try {
      if (typeof selected === "object" && selected.kind === "device") {
        const stepUpToken = await createStepUp();
        await settingsService.logoutDevice(selected.id, stepUpToken);
        setSettings(current => ({ ...current, devices: current.devices.filter(device => device.id !== selected.id) }));
        setInitial(current => ({ ...current, devices: current.devices.filter(device => device.id !== selected.id) }));
      } else if (selected === "logout-all") {
        const stepUpToken = await createStepUp();
        await settingsService.logoutAllDevices(stepUpToken);
        setConfirm(null);
        await onLogout();
        return;
      } else if (selected === "deactivate") {
        const stepUpToken = await createStepUp();
        await settingsService.deactivateAccount(stepUpToken);
      } else if (selected === "delete") {
        const stepUpToken = await createStepUp();
        await settingsService.requestAccountDeletion("Хэрэглэгч Settings хэсгээс бүртгэл устгах хүсэлт илгээв.", stepUpToken);
      }
      setConfirm(null);
      setToast("Үйлдэл амжилттай хийгдлээ.");
      if (selected === "deactivate") await onLogout();
    } catch (reason) {
      setConfirm(null);
      setToast(reason.message || "Үйлдлийг хийж чадсангүй.");
    }
  };

  if (loading) return <LoadingSkeleton variant="settings" />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  const account = settings.account;
  const isStudent = user.role === "STUDENT" || user.role === "Student";
  return (
    <>
      <PageHeader title="Тохиргоо" description="Бүртгэл, security, notification, privacy болон төхөөрөмжийн тохиргоог удирдана." />
      <div className="grid gap-6 lg:grid-cols-[230px_1fr]">
        <nav className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:block lg:space-y-1" aria-label="Settings navigation">
          {sections.map(([value, label]) => <button key={value} type="button" onClick={() => changeSection(value)}
            className={`w-full rounded-xl px-3 py-3 text-left text-sm font-bold transition lg:block lg:px-4 ${active === value ? "bg-slate-900 text-white shadow-md" : "border border-slate-200 bg-white text-slate-500 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 lg:border-transparent"}`}>{label}</button>)}
        </nav>
        <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 md:p-7">
          {active === "account" && <section><h2 className="font-display text-xl font-bold">Бүртгэл</h2><div className="mt-5 grid gap-4 md:grid-cols-2"><label className={labelClass}>Овог *<input value={account.lastName} onChange={event => update("account", "lastName", event.target.value)} className={fieldClass} />{inlineErrors.lastName && <span className="mt-1 block text-xs text-rose-600">{inlineErrors.lastName}</span>}</label><label className={labelClass}>Нэр *<input value={account.firstName} onChange={event => update("account", "firstName", event.target.value)} className={fieldClass} />{inlineErrors.firstName && <span className="mt-1 block text-xs text-rose-600">{inlineErrors.firstName}</span>}</label><div className="space-y-3"><label className={labelClass}>Одоогийн сургуулийн email<input disabled value={account.email} className={fieldClass} /><span className="mt-1 block text-[10px] text-amber-600">University domain-оор баталгаажсан.</span></label><label className={labelClass}>Шинэ сургуулийн email<input type="email" autoComplete="email" value={newEmail} onChange={event => setNewEmail(event.target.value)} placeholder="name@university.edu.mn" className={fieldClass} /></label><button type="button" disabled={requestingEmailChange || !newEmail.trim()} onClick={requestEmailChange} className="rounded-lg border border-blue-200 px-4 py-2 text-xs font-bold text-blue-700 disabled:cursor-not-allowed disabled:opacity-50">{requestingEmailChange ? "Илгээж байна..." : "Email солих баталгаажуулалт илгээх"}</button><p className="text-[10px] leading-relaxed text-slate-500">Шинэ хаяг ижил сургуулийн баталгаажсан domain-той байх ёстой. Admin account бол password + MFA, Student/Staff account бол password баталгаажуулалтын дараа холбоос илгээгдэнэ.</p></div><label className={labelClass}>Утас<input value={account.phone} onChange={event => update("account", "phone", event.target.value)} className={fieldClass} />{inlineErrors.phone && <span className="mt-1 block text-xs text-rose-600">{inlineErrors.phone}</span>}</label><label className={labelClass}>Сургууль<input disabled value={account.university} className={fieldClass} /></label><label className={labelClass}>Тэнхим<input value={account.department} onChange={event => update("account", "department", event.target.value)} className={fieldClass} /></label>{isStudent && <><label className={labelClass}>Мэргэжил<input value={account.major} onChange={event => update("account", "major", event.target.value)} className={fieldClass} /></label><label className={labelClass}>Элсэх он<input type="number" min="1950" max={new Date().getFullYear()} value={account.enrollmentYear} onChange={event => update("account", "enrollmentYear", event.target.value)} className={fieldClass} /></label><label className={labelClass}>Төгсөх он<input type="number" min="1900" max="2100" value={account.graduationYear} onChange={event => update("account", "graduationYear", event.target.value)} className={fieldClass} /></label></>}<label className={labelClass}>Цагийн бүс<select value={account.timezone} onChange={event => update("account", "timezone", event.target.value)} className={fieldClass}><option>Asia/Ulaanbaatar</option><option>UTC</option></select></label></div></section>}
          {active === "security" && <section><h2 className="font-display text-xl font-bold">Аюулгүй байдал</h2><div className="mt-5 max-w-xl space-y-4"><label className={labelClass}>Одоогийн нууц үг *<input type="password" value={passwords.current} onChange={event => setPasswords(value => ({ ...value, current: event.target.value }))} className={fieldClass} />{inlineErrors.current && <span className="text-xs text-rose-600">{inlineErrors.current}</span>}</label><label className={labelClass}>Шинэ нууц үг *<input type="password" value={passwords.next} onChange={event => setPasswords(value => ({ ...value, next: event.target.value }))} className={fieldClass} /><div className="mt-2 h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-blue-600 transition-all" style={{ width: `${passwordStrength}%` }} /></div>{inlineErrors.next && <span className="text-xs text-rose-600">{inlineErrors.next}</span>}</label><label className={labelClass}>Нууц үг давтах *<input type="password" value={passwords.repeat} onChange={event => setPasswords(value => ({ ...value, repeat: event.target.value }))} className={fieldClass} />{inlineErrors.repeat && <span className="text-xs text-rose-600">{inlineErrors.repeat}</span>}</label><div className="rounded-2xl border border-blue-100 bg-blue-50/40 p-4">
            {isAdminMfaRole ? <>
              <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-bold text-slate-900">Authenticator MFA</p><p className="mt-1 text-xs text-slate-500">University Admin болон Super Admin account-д TOTP + recovery code хамгаалалт заавал байна.</p></div><span className={`rounded-full px-3 py-1 text-[10px] font-bold ${settings.security.mfaEnabled ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{settings.security.mfaEnabled ? "Идэвхтэй" : "Admin-д заавал"}</span></div>
              {!settings.security.mfaEnabled && !mfaSetup && <div className="mt-4 flex flex-wrap items-end gap-3"><label className={`${labelClass} min-w-[240px] flex-1`}>Одоогийн нууц үг<input type="password" value={mfaPassword} onChange={event => setMfaPassword(event.target.value)} className={fieldClass} /></label><button type="button" onClick={startMfa} className="rounded-lg bg-blue-600 px-4 py-2.5 text-xs font-bold text-white">MFA тохируулах</button></div>}
              {mfaSetup && <div className="mt-4 grid gap-4 sm:grid-cols-[220px_1fr]"><img src={mfaSetup.qrDataUrl} alt="Authenticator QR" className="h-52 w-52 rounded-xl border border-slate-200 bg-white p-2" /><div className="space-y-3"><p className="text-xs text-slate-600">QR кодыг app-аар уншуул. Secret: <code className="break-all font-bold">{mfaSetup.secret}</code></p><input value={mfaCode} onChange={event => setMfaCode(event.target.value)} placeholder="6 оронтой код" className={fieldClass} /><button type="button" onClick={confirmMfa} className="rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-bold text-white">Код баталгаажуулах</button></div></div>}
              {settings.security.mfaEnabled && <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className={labelClass}>Одоогийн нууц үг<input type="password" value={mfaPassword} onChange={event => setMfaPassword(event.target.value)} className={fieldClass} /></label><label className={labelClass}>Authenticator / recovery code<input value={mfaCode} onChange={event => setMfaCode(event.target.value)} className={fieldClass} /></label><button type="button" onClick={regenerateRecoveryCodes} className="rounded-lg border border-blue-200 px-4 py-2.5 text-xs font-bold text-blue-700">Recovery code шинэчлэх</button><button type="button" onClick={disableMfa} className="rounded-lg border border-rose-200 px-4 py-2.5 text-xs font-bold text-rose-700">MFA идэвхгүй болгох</button><p className="text-xs text-slate-500 sm:col-span-2">Үлдсэн recovery code: {settings.security.recoveryCodesRemaining ?? 0}</p></div>}
            </> : <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-xs leading-relaxed text-blue-800">Student болон Staff account дээр Google Authenticator ашиглахгүй. Student password recovery нь linked Gmail / verified school email рүү Resend OTP ашиглана.</div>}
            {recoveryCodes.length > 0 && <div className="mt-4"><p className="mb-2 text-xs font-bold text-rose-700">Эдгээрийг одоо хуулж аюулгүй хадгал. Дахин бүтнээрээ харагдахгүй.</p><div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-950 p-4 font-mono text-xs text-white">{recoveryCodes.map(code => <code key={code}>{code}</code>)}</div></div>}
          </div>{user.googleId && <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4"><p className="text-sm font-bold text-slate-900">Google account холбогдсон</p><p className="mt-1 text-xs text-slate-500">{user.gmail || "Google identity"}</p>{user.authProvider === "PASSWORD_GOOGLE" ? <div className="mt-4 space-y-3"><label className={labelClass}>Google холбоос салгахын тулд одоогийн нууц үг<input type="password" value={googlePassword} onChange={event => setGooglePassword(event.target.value)} className={fieldClass} /></label><button type="button" disabled={unlinkingGoogle} onClick={unlinkGoogle} className="rounded-lg border border-rose-200 bg-white px-4 py-2 text-xs font-bold text-rose-600 disabled:opacity-50">{unlinkingGoogle ? "Салгаж байна..." : "Google холбоос салгах"}</button></div> : <p className="mt-3 text-xs font-semibold text-amber-700">Google-only account тул эхлээд local нууц үгийн сэргээх урсгалаар нууц үг тохируулсны дараа холбоос салгана.</p>}</div>}<button type="button" onClick={() => setConfirm("logout-all")} className="rounded-lg border border-rose-200 px-4 py-2 text-xs font-bold text-rose-600">Бүх төхөөрөмжөөс гарах</button></div></section>}
          {active === "notifications" && <section><h2 className="font-display text-xl font-bold">Мэдэгдэл</h2><div className="mt-5 grid gap-x-8 lg:grid-cols-2">{[["inApp", "In-app"], ["email", "Email"], ["push", "Push"], ["opportunities", "Шинэ боломж"], ["eventReminder", "Арга хэмжээний сануулга"], ["applicationStatus", "Өргөдлийн статус"], ["waitlist", "Waitlist шинэчлэлт"], ["surveyDeadline", "Судалгааны хугацаа"], ["announcements", "Зарлал"], ["system", "Системийн мэдэгдэл"]].map(([key, label]) => <Toggle key={key} label={label} checked={settings.notifications[key]} onChange={value => update("notifications", key, value)} />)}</div><label className={`${labelClass} mt-5 max-w-sm`}>Notification frequency<select value={settings.notifications.frequency} onChange={event => update("notifications", "frequency", event.target.value)} className={fieldClass}><option>Шууд</option><option>Өдөрт нэг удаа</option><option>7 хоногт нэг удаа</option></select></label></section>}
          {active === "privacy" && <section><h2 className="font-display text-xl font-bold">Нууцлал ба зөвшөөрөл</h2><div className="mt-5 grid gap-4 md:grid-cols-2"><label className={labelClass}>Profile visibility<select value={settings.privacy.profileVisibility} onChange={event => update("privacy", "profileVisibility", event.target.value)} className={fieldClass}><option>Миний сургууль</option><option>Зөвхөн би</option><option>UniNet сүлжээ</option></select></label><label className={labelClass}>CV sharing preference<select value={settings.privacy.cvSharing} onChange={event => update("privacy", "cvSharing", event.target.value)} className={fieldClass}><option>Зөвхөн зөвшөөрсөн өргөдөл</option><option>Хэзээ ч үгүй</option></select></label></div><Toggle label="Recommendation data preference" checked={settings.privacy.recommendations} onChange={value => update("privacy", "recommendations", value)} /><h3 className="font-display mb-3 mt-7 font-bold">Consent history</h3><div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-xs"><thead className="bg-slate-50"><tr><th className="p-3">Огноо</th><th>Хүлээн авагч</th><th>Зорилго</th><th>Хуваалцсан мэдээлэл</th></tr></thead><tbody>{settings.consentHistory.map(item => <tr key={item.id} className="border-t border-slate-100"><td className="p-3">{formatDate(item.grantedAt || item.date)}</td><td>{item.recipient}</td><td>{item.purpose}</td><td>{item.data}</td></tr>)}</tbody></table></div><button type="button" onClick={() => download("personal-data")} className="mt-5 rounded-lg border border-slate-200 px-4 py-2 text-xs font-bold">Personal data татах</button></section>}
          {active === "appearance" && <section><h2 className="font-display text-xl font-bold">Харагдах байдал</h2><div className="mt-5 grid grid-cols-3 gap-3">{["light", "dark", "system"].map(item => <button key={item} type="button" onClick={() => update("appearance", "theme", item)} className={`rounded-xl border p-5 text-xs font-bold ${settings.appearance.theme === item ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200"}`}>{item === "system" ? "System default" : item}</button>)}</div><label className={`${labelClass} mt-6`}>Density<select value={settings.appearance.density} onChange={event => update("appearance", "density", event.target.value)} className={fieldClass}><option value="compact">Compact</option><option value="comfortable">Comfortable</option></select></label><Toggle label="Reduced motion" checked={settings.appearance.reducedMotion} onChange={value => update("appearance", "reducedMotion", value)} /></section>}
          {active === "locale" && <section><h2 className="font-display text-xl font-bold">Хэл ба бүс</h2><div className="mt-5 grid gap-4 md:grid-cols-2"><label className={labelClass}>Хэл<select value={settings.locale.language} onChange={event => update("locale", "language", event.target.value)} className={fieldClass}><option>Монгол</option><option>English</option></select></label><label className={labelClass}>Timezone<select value={settings.locale.timezone} onChange={event => update("locale", "timezone", event.target.value)} className={fieldClass}><option>Asia/Ulaanbaatar</option><option>UTC</option></select></label><label className={labelClass}>Date format<select value={settings.locale.dateFormat} onChange={event => update("locale", "dateFormat", event.target.value)} className={fieldClass}><option>YYYY.MM.DD</option><option>DD/MM/YYYY</option></select></label><label className={labelClass}>Hour format<select value={settings.locale.hourFormat} onChange={event => update("locale", "hourFormat", event.target.value)} className={fieldClass}><option value="24">24 цаг</option><option value="12">12 цаг</option></select></label></div></section>}
          {active === "accessibility" && <section><h2 className="font-display text-xl font-bold">Хүртээмж</h2><label className={`${labelClass} mt-5`}>Font size<select value={settings.accessibility.fontSize} onChange={event => update("accessibility", "fontSize", event.target.value)} className={fieldClass}><option value="small">Жижиг</option><option value="normal">Хэвийн</option><option value="large">Том</option></select></label>{[["highContrast", "High contrast"], ["reducedMotion", "Reduced motion"], ["focusIndicator", "Visible focus indicator"], ["underlineLinks", "Underline links"]].map(([key, label]) => <Toggle key={key} label={label} checked={settings.accessibility[key]} onChange={value => update("accessibility", key, value)} />)}</section>}
          {active === "devices" && <section><h2 className="font-display text-xl font-bold">Идэвхтэй төхөөрөмжүүд</h2><div className="mt-5 space-y-3">{settings.devices.map(device => <div key={device.id} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 p-4"><div><div className="flex items-center gap-2"><b className="text-sm">{device.device}</b>{device.current && <span className="rounded-full bg-emerald-50 px-2 py-1 text-[9px] font-bold text-emerald-700">Current device</span>}</div><p className="mt-1 text-xs text-slate-400">{device.browser} · {device.location} · {formatDateTime(device.lastActiveAt || device.lastActive)}</p></div>{!device.current && <button type="button" onClick={() => setConfirm({ kind: "device", id: device.id })} className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-bold text-rose-600">Гарах</button>}</div>)}</div>{!settings.devices.length && <p className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">Идэвхтэй session олдсонгүй.</p>}<button type="button" onClick={() => setConfirm("logout-all")} className="mt-5 rounded-lg border border-rose-200 px-4 py-2 text-xs font-bold text-rose-600">Бүх төхөөрөмжөөс гарах</button></section>}
          {active === "data" && <section><h2 className="font-display text-xl font-bold">Өгөгдөл ба бүртгэл</h2><div className="mt-5 grid gap-3 md:grid-cols-3">{[["personal-data", "Personal data"], ["registrations", "Registration history"], ["applications", "Application history"]].map(([kind, label]) => <button key={kind} type="button" onClick={() => download(kind)} className="rounded-xl border border-slate-200 p-4 text-xs font-bold">{label} татах</button>)}</div><div className="mt-8 border-t border-rose-100 pt-6"><h3 className="font-display font-bold text-rose-700">Danger zone</h3><div className="mt-4 flex flex-wrap gap-3"><button type="button" onClick={() => setConfirm("deactivate")} className="rounded-lg border border-rose-200 px-4 py-2 text-xs font-bold text-rose-600">Account deactivate</button><button type="button" onClick={() => setConfirm("delete")} className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-bold text-white">Account deletion request</button></div></div></section>}
          {active === "help" && <section><h2 className="font-display text-xl font-bold">Help</h2><p className="mt-2 text-sm text-slate-500">UniNet ашиглахтай холбоотой түгээмэл асуулт болон тусламж.</p><div className="mt-6 space-y-3">{helpArticles.map(article => <details key={article.title} className="rounded-xl border border-slate-200 p-4"><summary className="cursor-pointer text-sm font-bold">{article.title}</summary><div className="mt-3 space-y-3">{article.paragraphs.map(paragraph => <p key={paragraph} className="text-sm leading-relaxed text-slate-500">{paragraph}</p>)}</div></details>)}</div><a href="mailto:support@uninet.mn" className="mt-6 inline-flex rounded-lg bg-slate-900 px-5 py-3 text-xs font-bold text-white">Support-той холбогдох</a></section>}
          {active === "feedback" && <section><h2 className="font-display text-xl font-bold">Send feedback</h2><p className="mt-2 text-sm text-slate-500">Санал хүсэлт, асуудал эсвэл шинэ боломжийн санаагаа илгээнэ үү. Илгээсэн хүсэлт University Admin болон Platform Admin-ийн санал хүсэлтийн жагсаалтад очно.</p><form className="mt-6 max-w-2xl space-y-4" onSubmit={sendFeedback}><label className={labelClass}>Төрөл<select name="type" required className={fieldClass}><option>Санал хүсэлт</option><option>Алдаа мэдээлэх</option><option>Шинэ боломж санал болгох</option></select></label><label className={labelClass}>Гарчиг<input name="title" required minLength="2" maxLength="200" className={fieldClass} /></label><label className={labelClass}>Дэлгэрэнгүй<textarea name="details" required minLength="3" maxLength="5000" rows="7" className={fieldClass} /></label><button disabled={saving} className="rounded-lg bg-slate-900 px-5 py-3 text-xs font-bold text-white disabled:opacity-60">{saving ? "Илгээж байна..." : "Илгээх"}</button></form></section>}
          {!["devices", "data", "help", "feedback"].includes(active) && <div className="mt-8 flex justify-end gap-2 border-t border-slate-100 pt-5"><button type="button" onClick={cancel} disabled={!dirty && active !== "security"} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-bold disabled:opacity-40">Cancel / Reset</button><button type="button" onClick={save} disabled={saving} className="rounded-lg bg-slate-900 px-5 py-2 text-xs font-bold text-white disabled:opacity-60">{saving ? "Хадгалж байна..." : "Save"}</button></div>}
        </div>
      </div>
      {confirm && <ConfirmDialog title="Аюултай үйлдлийг баталгаажуулах" description="Энэ үйлдэл таны account эсвэл active session-д нөлөөлнө. Үргэлжлүүлэх эсэхээ баталгаажуулна уу." danger confirmLabel="Тийм, үргэлжлүүлэх" onClose={() => setConfirm(null)} onConfirm={confirmAction} />}
      {toast && <Toast message={toast} onClose={() => setToast("")} />}
    </>
  );
}
