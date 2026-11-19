export default function PortalLoading(){
 return <div className="shell portal-shell" aria-busy="true" aria-label="Loading customer portal">
  <aside className="portal-sidebar"><div className="portal-sidebar-heading">CUSTOMER MENU</div><div className="portal-loading-lines"><span/><span/><span/><span/><span/></div></aside>
  <main className="portal-main"><div className="portal-page-heading"><span className="portal-loading-bar short"/><span className="portal-loading-bar title"/><span className="portal-loading-bar wide"/></div><div className="portal-loading-grid"><span/><span/><span/></div><div className="portal-loading-panel"><span/><span/><span/><span/></div></main>
 </div>;
}
