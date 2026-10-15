import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './api';
import Shell from './components/Shell';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import { Contacts, CustomerDetail, Customers, Elderly, ElderlyDetail, SearchPage } from './pages/People';
import { Alerts, Calls, Reminders, Schedules } from './pages/Voice';
import { Deliveries, OrderDetail, Orders, Providers } from './pages/Care';
import { Notifications, Payments, Reports, Settings, Subscriptions, Support } from './pages/Office';

function Guard() {
  const { token, user } = useAuth();
  if (!token || !user || !['admin', 'staff'].includes(user.role)) return <Navigate to="/login" replace />;
  return <Shell />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Guard />}>
        <Route index element={<Dashboard />} />
        <Route path="customers" element={<Customers />} />
        <Route path="customers/:id" element={<CustomerDetail />} />
        <Route path="elderly" element={<Elderly />} />
        <Route path="elderly/:id" element={<ElderlyDetail />} />
        <Route path="calls" element={<Calls />} />
        <Route path="schedules" element={<Schedules />} />
        <Route path="reminders" element={<Reminders />} />
        <Route path="alerts" element={<Alerts />} />
        <Route path="orders" element={<Orders />} />
        <Route path="orders/:id" element={<OrderDetail />} />
        <Route path="deliveries" element={<Deliveries />} />
        <Route path="payments" element={<Payments />} />
        <Route path="contacts" element={<Contacts />} />
        <Route path="providers" element={<Providers />} />
        <Route path="subscriptions" element={<Subscriptions />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="reports" element={<Reports />} />
        <Route path="support" element={<Support />} />
        <Route path="settings" element={<Settings />} />
        <Route path="search" element={<SearchPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
