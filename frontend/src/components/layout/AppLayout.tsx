import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';

export default function AppLayout() {
  return (
    <>
      <Sidebar />
      <div className="main-content">
        <Outlet />
      </div>
    </>
  );
}
