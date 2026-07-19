import { useState } from 'react';
import { useListAdminUsers } from '@workspace/api-client-react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Shield, User, ChevronLeft, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';

export default function AdminUsers() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  
  // Custom simple debounce instead of a full hook
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    // Let users hit enter to search immediately, or we could add a timer
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setDebouncedSearch(search);
    setPage(1);
  };

  const { data: usersData, isLoading } = useListAdminUsers({
    page,
    limit: 10,
    search: debouncedSearch || undefined
  });

  return (
    <AdminLayout>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white">Users</h1>
          <p className="text-muted-foreground mt-1">Manage platform users and their roles.</p>
        </div>
        
        <form onSubmit={handleSearchSubmit} className="flex gap-2 w-full md:w-auto">
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search users..." 
              className="pl-9 bg-black/50 border-white/10" 
              value={search}
              onChange={handleSearchChange}
            />
          </div>
          <Button type="submit" variant="secondary" className="bg-white/10 hover:bg-white/20 text-white">Search</Button>
        </form>
      </div>

      <Card className="glass-card border-white/10">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground animate-pulse">Loading users...</div>
          ) : usersData?.data && usersData.data.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-muted-foreground uppercase bg-black/40 border-b border-white/5">
                    <tr>
                      <th className="px-6 py-4 font-medium">User</th>
                      <th className="px-6 py-4 font-medium">Role</th>
                      <th className="px-6 py-4 font-medium">Joined</th>
                      <th className="px-6 py-4 font-medium">Telegram</th>
                      <th className="px-6 py-4 font-medium">Wallet</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {usersData.data.map((user) => (
                      <tr key={user.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-white/5 flex items-center justify-center">
                              {user.role === 'admin' ? <Shield className="h-4 w-4 text-amber-500" /> : <User className="h-4 w-4 text-primary" />}
                            </div>
                            <div>
                              <div className="font-medium text-white">{user.email}</div>
                              {user.username && <div className="text-xs text-muted-foreground">@{user.username}</div>}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                            user.role === 'admin' ? 'bg-amber-500/20 text-amber-500' : 'bg-white/10 text-white'
                          }`}>
                            {user.role}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-muted-foreground">
                          {format(new Date(user.created_at), 'MMM d, yyyy')}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`text-xs ${user.telegram_status === 'linked' ? 'text-primary' : 'text-muted-foreground'}`}>
                            {user.telegram_status?.replace('_', ' ') || 'not linked'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          {user.wallet_address ? (
                            <span className="font-mono text-xs text-muted-foreground" title={user.wallet_address}>
                              {user.wallet_address.substring(0, 4)}...{user.wallet_address.substring(user.wallet_address.length - 4)}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground/50">None</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              <div className="p-4 border-t border-white/5 flex items-center justify-between text-sm text-muted-foreground">
                <div>
                  Showing {((page - 1) * 10) + 1} to Math.min(page * 10, usersData.total) of {usersData.total} users
                </div>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="border-white/10 bg-black/50" 
                    disabled={page === 1}
                    onClick={() => setPage(p => p - 1)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="border-white/10 bg-black/50"
                    disabled={page * 10 >= usersData.total}
                    onClick={() => setPage(p => p + 1)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="p-8 text-center text-muted-foreground">
              No users found matching your search.
            </div>
          )}
        </CardContent>
      </Card>
    </AdminLayout>
  );
}