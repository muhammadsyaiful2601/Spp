import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Loader2, Plus } from "lucide-react";
import type { AcademicYear } from "../api";

/**
 * Academic year switcher.
 *
 * Reading the year list is open to every signed-in user, but creating and
 * activating a year is restricted to `pimpinan`, so the manage actions are
 * gated on `canManage` instead of being hidden behind an error from the server.
 */
export function AcademicYearSwitcher({
  academicYears,
  canManage,
  onCreate,
  onSelect,
  onActivate,
  selectedId,
  variant = "topbar",
  busy = false,
}: {
  academicYears: AcademicYear[];
  canManage: boolean;
  onCreate: (input: {
    startYear: number;
    endYear: number;
    copyFrom: number | null;
  }) => Promise<void>;
  /** Set the server-side default year, which other clients also resolve to. */
  onActivate: (yearId: number) => Promise<void>;
  onSelect: (yearId: number) => void;
  selectedId: number | null;
  variant?: "topbar" | "panel";
  busy?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [startYear, setStartYear] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Close on outside click and on Escape, matching the notification panel.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const selected = academicYears.find((year) => year.id === selectedId) ?? null;
  const label = selected?.name ?? "Tahun ajaran";

  const submitCreate = async () => {
    const start = Number(startYear);
    // Guard here as well as server-side so the year stays consistent.
    if (!Number.isInteger(start) || start < 2000 || start > 2100) return;
    const copyFrom = academicYears[0]?.id ?? null;
    await onCreate({ startYear: start, endYear: start + 1, copyFrom });
    setStartYear("");
    setCreating(false);
  };
return (
    <div className={`year-switcher is-${variant}`} ref={rootRef}>
      <button
        type="button"
        className="year-switcher-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={busy}
        onClick={() => setOpen((value) => !value)}
      >
        {busy ? <Loader2 size={13} className="spin" /> : null}
        {variant === "topbar" ? label : `Tahun ajaran · ${label}`}
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="year-menu" role="listbox" aria-label="Pilihan tahun ajaran">
          {academicYears.length === 0 ? (
            <p className="year-menu-empty">Belum ada tahun ajaran.</p>
          ) : (
            academicYears.map((year) => (
              <button
                key={year.id}
                type="button"
                role="option"
                aria-selected={year.id === selectedId}
                className={`year-option ${year.id === selectedId ? "is-selected" : ""}`}
                onClick={() => {
                  onSelect(year.id);
                  setOpen(false);
                }}
              >
                <span className="year-option-main">
                  <strong>{year.name}</strong>
                  <small>
                    {year.students_count} siswa · {year.bills_count} tagihan
                  </small>
                </span>
                <span className="year-option-side">
                  {year.is_active ? (
                    <em className="year-badge">Aktif</em>
                  ) : (
                    canManage && (
                      <button
                        type="button"
                        className="year-activate"
                        title="Jadikan tahun ajaran aktif"
                        disabled={busy}
                        onClick={(event) => {
                          event.stopPropagation();
                          void onActivate(year.id);
                        }}
                      >
                        Aktifkan
                      </button>
                    )
                  )}
                  {!year.has_tariffs && (
                    <em
                      className="year-badge is-warning"
                      title="Belum ada tarif SPP untuk tahun ini"
                    >
                      Tanpa tarif
                    </em>
                  )}
                  {year.id === selectedId && <Check size={14} />}
                </span>
              </button>
            ))
          )}
          {canManage && (
            <div className="year-menu-manage">
              {creating ? (
                <div className="year-create">
                  <label htmlFor="year-start">Tahun mulai</label>
                  <input
                    id="year-start"
                    type="number"
                    min={2000}
                    max={2100}
                    placeholder="mis. 2027"
                    value={startYear}
                    onChange={(event) => setStartYear(event.target.value)}
                  />
                  <p className="year-create-hint">
                    Tarif SPP dan biaya lain disalin dari tahun ajar saat ini.
                  </p>
                  <div className="year-create-actions">
                    <button type="button" onClick={() => setCreating(false)}>
                      Batal
                    </button>
                    <button
                      type="button"
                      className="is-primary"
                      disabled={!startYear || busy}
                      onClick={() => void submitCreate()}
                    >
                      Simpan
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="year-add"
                  onClick={() => {
                    const latest = academicYears.reduce(
                      (max, year) => Math.max(max, year.start_year),
                      new Date().getFullYear(),
                    );
                    setStartYear(String(latest + 1));
                    setCreating(true);
                  }}
                >
                  <Plus size={14} /> Tahun ajaran baru
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default AcademicYearSwitcher;