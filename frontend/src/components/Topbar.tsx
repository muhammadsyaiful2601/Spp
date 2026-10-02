import type { Notice, Page } from "../types";
import type { formatToday } from "../lib/format";
import { noticeIconMap } from "../lib/notices";
import type { AuthUser } from "../api";
import { ArrowRight, Bell, CalendarDays, CheckCheck, ChevronDown, ChevronRight, Clock, Menu } from "lucide-react";

export function Topbar({
  academicYear,
  currentUser,
  markAllNoticesRead,
  noticeOpen,
  noticeRef,
  notices,
  openNotice,
  page,
  pageTitles,
  readNotices,
  setMobileNav,
  setNoticeOpen,
  setPage,
  today,
  unreadCount,
}: {
  academicYear: string;
  currentUser: AuthUser;
  markAllNoticesRead: () => void;
  noticeOpen: boolean;
  noticeRef: React.RefObject<HTMLDivElement | null>;
  notices: Notice[];
  openNotice: (notice: Notice) => void;
  page: Page;
  pageTitles: Record<Page, string>;
  readNotices: string[];
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
              <span className="academic-year">
                {academicYear} <ChevronDown size={14} />
              </span>
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
              <div className="top-avatar">{currentUser.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</div>
            </div>
          </header>
  );
}

export default Topbar;
