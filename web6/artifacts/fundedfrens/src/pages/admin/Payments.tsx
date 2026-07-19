import { useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import AdminOrders from './Orders';

// Reusing AdminOrders component for Payments, filtering could be added 
// if the API supported it, but they use the same underlying hook listAdminOrders
export default function AdminPayments() {
  return <AdminOrders />;
}