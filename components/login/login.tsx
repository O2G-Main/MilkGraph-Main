"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Lock, Mail } from "lucide-react";
import { demoPassword, emailOf, login, useDemo } from "@/lib/demo";
import { ROLE_IDS, roleLabel } from "@/lib/roles";
import { Icon } from "@/components/ui";
import { Select } from "@/components/ui/fields";

/** Diadaptasi dari "Clean & Minimal sign in" (21st.dev, @preetsuthar17, MIT). Email dipilih dari akun demo; kata sandi terisi sesuai peran. */
export function Login() {
  const router = useRouter();
  const { users } = useDemo();
  const accounts = ROLE_IDS.flatMap(role => users.filter(u => u.active && u.role === role));
  const [userId, setUserId] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const user = accounts.find(u => u.id === userId);
  const password = user ? demoPassword(user.role) : "";

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!user) { setError("Pilih email akun dulu."); return; }
    setBusy(true);
    setError(null);
    try {
      await login(user.id, password);
      router.replace("/");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Gagal masuk.");
      setBusy(false);
    }
  }

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={submit} noValidate>
        <svg className="login-mark" viewBox="44 60 184 136" aria-hidden="true"><path fill="var(--color-surface-inverse)" d="M44 116A56 56 0 0 1 156 116V196H116V116A16 16 0 0 0 84 116H44ZM116 196V116A56 56 0 0 1 228 116V196H188V116A16 16 0 0 0 156 116V196Z" /><circle fill="var(--color-accent-fill)" cx="64" cy="176" r="20" /></svg>
        <h1>Masuk ke MilkGraph</h1>
        <p className="login-lead">Pilih email akun sesuai peran. Kata sandi akun demo terisi otomatis.</p>

        <div className="login-fields">
          <div className="login-field">
            <span className="login-icon"><Icon icon={Mail} size={16} /></span>
            <Select
              id="login-email"
              label="Email"
              placeholder="Pilih email akun"
              value={userId}
              onChange={id => { setUserId(id); setError(null); }}
              options={accounts.map(u => ({ value: u.id, label: emailOf(u.name), hint: u.name, group: roleLabel(u.role) }))}
            />
          </div>
          <div className="login-field">
            <span className="login-icon"><Icon icon={Lock} size={16} /></span>
            <input
              id="login-password"
              type={show ? "text" : "password"}
              value={password}
              readOnly
              placeholder="Kata sandi"
              aria-label="Kata sandi"
              autoComplete="off"
            />
            <button type="button" className="login-reveal" onClick={() => setShow(s => !s)} aria-label={show ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"} aria-pressed={show}>
              <Icon icon={show ? EyeOff : Eye} size={16} />
            </button>
          </div>
          {user && <p className="login-hint">{user.name} · {roleLabel(user.role)}</p>}
          {error && <p className="login-error" role="alert">{error}</p>}
        </div>

        <button type="submit" className="button primary wide login-submit" disabled={busy}>{busy ? "Memeriksa akun…" : "Masuk"}</button>

      </form>
    </main>
  );
}
