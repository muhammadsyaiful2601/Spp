import type { Page, Profile } from "../types";
import type { LucideIcon } from "lucide-react";

export type NavLink = { id: Page; text: string; icon: LucideIcon };
export type NavGroup = { label: string; links: NavLink[] };
import type { AuthUser } from "../api";
import { ChevronDown, LogOut, Sparkles, X } from "lucide-react";
import { MosqueMark, StarMotif } from "./icons";
import Avatar from "./Avatar";

export function Sidebar({
  currentUser,
  handleLogout,
  mobileNav,
  navGroups,
  page,
  profile,
  setMobileNav,
  setPage,
}: {
  currentUser: AuthUser;
  handleLogout: () => void;
  mobileNav: boolean;
  navGroups: NavGroup[];
  page: Page;
  profile: Profile;
  setMobileNav: (value: boolean) => void;
  setPage: (page: Page) => void;
}) {
  return (
        <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
          <div className="brand">
            <div className="brand-mark">
              {profile.logo ? (
                <img src={profile.logo} alt="" />
              ) : (
                <MosqueMark size={22} />
              )}
            </div>
            <div>
              <strong>{profile.school}</strong>
              <span>SDIT · PORTAL KEUANGAN</span>
            </div>
            <button
              className="icon-button sidebar-close"
              aria-label="Tutup menu"
              onClick={() => setMobileNav(false)}
            >
              <X size={18} />
            </button>
          </div>
          <div className="school-switch">
            <div className="school-avatar">SDIT</div>
            <div>
              <span>UNIT SEKOLAH</span>
              <strong>SD · Tahun 2026/27</strong>
            </div>
            <ChevronDown size={15} />
          </div>
          <nav className="main-nav" aria-label="Navigasi utama">
            {navGroups.map((group) => (
              <div className="nav-group" key={group.label}>
                <p>{group.label}</p>
                {group.links.map(({ id, text, icon: Icon }) => (
                  <button
                    key={id}
                    className={`nav-link ${page === id ? "active" : ""}`}
                    onClick={() => {
                      setPage(id);
                      setMobileNav(false);
                    }}
                  >
                    <Icon size={18} strokeWidth={1.8} />
                    <span>{text}</span>
                    {id === "pembayaran" && <i className="nav-dot" />}
                  </button>
                ))}
              </div>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="term-card">
              <div className="term-icon">
                <Sparkles size={16} />
              </div>
              <div>
                <strong>Semester Ganjil</strong>
                <span>Juli – Desember 2026</span>
              </div>
              <StarMotif size={14} />
            </div>
            <div className="user-profile">
              <button
                className="user-profile-main"
                onClick={() => setPage("akun")}
                aria-current={page === "akun" ? "page" : undefined}
                title="Buka akun saya"
              >
                <Avatar
                  className="user-avatar"
                  name={currentUser.name}
                  photoPath={currentUser.photo_path}
                />
                <span className="user-profile-text">
                  <strong>{currentUser.name}</strong>
                  <span>
                    @{currentUser.username} ·{" "}
                    {currentUser.role === "pimpinan" ? "Pimpinan" : "Bendahara"}
                  </span>
                </span>
              </button>
              <button
                className="icon-button user-logout"
                title="Keluar"
                aria-label="Keluar dari akun"
                onClick={handleLogout}
              >
                <LogOut size={17} />
              </button>
            </div>
          </div>
        </aside>
  );
}

export default Sidebar;
