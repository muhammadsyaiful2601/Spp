

export function SidebarScrim({

  setMobileNav,
}: {

  setMobileNav: (value: boolean) => void;
}) {
  return (
          <button
            className="sidebar-scrim"
            aria-label="Tutup navigasi"
            onClick={() => setMobileNav(false)}
          />
        
  );
}

export default SidebarScrim;
