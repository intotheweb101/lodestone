/**
 * Embed layout — hides the global sidebar and nav so /embed/* pages
 * render chrome-free and are suitable for iframing.
 */
export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Inject CSS that hides root-layout chrome on embed routes */}
      <style>{`
        .sidebar-desktop { display: none !important; }
        .mobile-topbar   { display: none !important; }
        .mobile-drawer   { display: none !important; }
      `}</style>
      {children}
    </>
  );
}
