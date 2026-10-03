import type { Notice, Page } from "../types";
import type { formatToday } from "../lib/format";
import { noticeIconMap } from "../lib/notices";
import type { AcademicYear, AuthUser } from "../api";
import { ArrowRight, Bell, CalendarDays, CheckCheck, ChevronRight, Clock, Menu } from "lucide-react";
import AcademicYearSwitcher from "./AcademicYearSwitcher";
import Avatar from "./Avatar";

export function Topbar({
  academicYears,
  canManageYears,
  currentUser,
  markAllNoticesRead,
  noticeOpen,
  noticeRef,
  notices,
  onCreateYear,
  onActivate,
  onSelectYear,
  openNotice,
  page,
  pageTitles,
  portalQuerying,
  readNotices,
  selectedYearId,
  setMobileNav,
  setNoticeOpen,
  setPage,
  today,
  unreadCount,
}: {
  academicYears: AcademicYear[];
  canManageYears: boolean;
  currentUser: AuthUser;
  markAllNoticesRead: () => void;
  noticeOpen: boolean;
  noticeRef: React.RefObject<HTMLDivElement | null>;
  notices: Notice[];
  onCreateYear: (input: {
    startYear: number;
    endYear: number;
    copyFrom: number | null;
  }) => Promise<void>;
  onActivate: (yearId: number) => Promise<void>;
  onSelectYear: (yearId: number) => void;
  openNotice: (notice: Notice) => void;
  page: Page;
  pageTitles: Record<Page, string>;
  portalQuerying: boolean;
  readNotices: string[];
  selectedYearId: number | null;
  setMobileNav: (value: boolean) => void;
  setNoticeOpen: (value: boolean) => void;
  setPage: (page: Page) => void;
  today: ReturnType<typeof formatToday>;
  unreadCount: number;
}) {
  return (
          <header className="topbar">
            <button
              className="icon-button mobile-menu"
              aria-label="Buka menu"
              onClick={() => setMobileNav(true)}
            >
              <Menu size={21} />
            </button>
            <div className="breadcrumbs">
              <span>Keuangan</span>
              <ChevronRight size={14} />
              <strong>{pageTitles[page]}</strong>
            </div>
            <div className="top-actions">
              <span className="topbar-date" title={today.long}>
                <CalendarDays size={15} />
                <span className="topbar-date-text">
                  <strong>{today.short}</strong>
                  <small>
                    <Clock size={11} /> {today.clock}
                  </small>
                </span>
              </span>
              <AcademicYearSwitcher
                academicYears={academicYears}
                canManage={canManageYears}
                onCreate={onCreateYear}
                onActivate={onActivate}
                onSelect={onSelectYear}
                selectedId={selectedYearId}
                busy={portalQuerying}
              />
              <div className="notice-anchor" ref={noticeRef}>
                <button
                  className={`icon-button notification-button ${noticeOpen ? "is-open" : ""}`}
                  title="Notifikasi"
                  aria-label={`Notifikasi${unreadCount > 0 ? `, ${unreadCount} belum dibaca` : ""}`}
                  aria-expanded={noticeOpen}
                  onClick={() => setNoticeOpen(!noticeOpen)}
                >
                  <Bell size={18} />
                  {unreadCount > 0 && <i className="notice-badge">{unreadCount > 9 ? "9+" : unreadCount}</i>}
                </button>
                {noticeOpen && (
                  <div className="notice-panel" role="dialog" aria-label="Daftar notifikasi">
                    <div className="notice-head">
                      <div>
                        <strong>Notifikasi</strong>
                        <span>
                          {unreadCount > 0
                            ? `${unreadCount} belum dibaca`
                            : "Semua sudah dibaca"}
                        </span>
                      </div>
                      {unreadCount > 0 && (
                        <button
                          type="button"
                          className="notice-read-all"
                          onClick={markAllNoticesRead}
                        >
                          <CheckCheck size={13} /> Tandai dibaca
                        </button>
                      )}
                    </div>
                    <div className="notice-list">
                      {notices.length === 0 ? (
                        <div className="notice-empty">
                          <Bell size={19} />
                          <p>Belum ada notifikasi</p>
                          <span>Informasi tunggakan dan pembayaran muncul di sini.</span>
                        </div>
                      ) : (
                        notices.map((notice) => {
                          const NoticeIcon = noticeIconMap[notice.icon];
                          const isRead = readNotices.includes(notice.id);
                          return (
                            <button
                              type="button"
                              key={notice.id}
                              className={`notice-item ${isRead ? "is-read" : "is-unread"}`}
                              onClick={() => openNotice(notice)}
                            >
                              <span className={`notice-icon ${notice.tone}`}>
                                <NoticeIcon size={15} />
                              </span>
                              <span className="notice-body">
                                <strong>{notice.title}</strong>
                                <span>{notice.body}</span>
                                <small>{notice.time}</small>
                              </span>
                              {!isRead && (
                                <>
                                  <i className="notice-unread" aria-hidden="true" />
                                  <span className="sr-only">Belum dibaca</span>
                                </>
                              )}
                            </button>
                          );
                        })
                      )}
                    </div>
                    <button
                      type="button"
                      className="notice-footer"
                      onClick={() => {
                        setPage("laporan");
                        setNoticeOpen(false);
                      }}
                    >
                      Lihat laporan keuangan <ArrowRight size={14} />
                    </button>
                  </div>
                )}
              </div>
              <Avatar
                className="top-avatar"
                name={currentUser.name}
                photoPath={currentUser.photo_path}
              />
            </div>
          </header>
  );
}

export default Topbar;
