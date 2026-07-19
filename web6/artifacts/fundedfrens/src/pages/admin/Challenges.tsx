import { useState } from 'react';
import { useListAdminChallengePlans, useCreateAdminChallengePlan, useUpdateAdminChallengePlan } from '@workspace/api-client-react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Edit2, CheckCircle, XCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';

const planSchema = z.object({
  name: z.string().min(1, "Name is required"),
  slug: z.string().min(1, "Slug is required").regex(/^[a-z0-9-]+$/, "Lowercase alphanumeric and dashes only"),
  price_usd: z.coerce.number().min(0),
  funded_sol: z.coerce.number().min(0),
  status: z.enum(['active', 'inactive', 'coming_soon', 'archived']),
  display_order: z.coerce.number().min(0),
  description: z.string().optional(),
  profit_target_pct: z.coerce.number().min(0),
  max_drawdown_pct: z.coerce.number().min(0),
  daily_drawdown_pct: z.coerce.number().min(0),
  min_trading_days: z.coerce.number().min(0),
  max_position_size_pct: z.coerce.number().min(0),
  max_open_positions: z.coerce.number().min(0),
  reactivation_cost_pct: z.coerce.number().min(0),
});

export default function AdminChallenges() {
  const { data: plans, isLoading, refetch } = useListAdminChallengePlans();
  const createPlan = useCreateAdminChallengePlan();
  const updatePlan = useUpdateAdminChallengePlan();
  const { toast } = useToast();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const form = useForm<z.infer<typeof planSchema>>({
    resolver: zodResolver(planSchema),
    defaultValues: {
      name: '',
      slug: '',
      price_usd: 0,
      funded_sol: 0,
      status: 'inactive',
      display_order: 0,
      description: '',
      profit_target_pct: 10,
      max_drawdown_pct: 10,
      daily_drawdown_pct: 5,
      min_trading_days: 0,
      max_position_size_pct: 100,
      max_open_positions: 10,
      reactivation_cost_pct: 90,
    }
  });

  const openCreateDialog = () => {
    setEditingId(null);
    form.reset({
      name: '', slug: '', price_usd: 100, funded_sol: 100, status: 'inactive', display_order: 0,
      description: '', profit_target_pct: 10, max_drawdown_pct: 10, daily_drawdown_pct: 5,
      min_trading_days: 0, max_position_size_pct: 100, max_open_positions: 10, reactivation_cost_pct: 90,
    });
    setIsDialogOpen(true);
  };

  const openEditDialog = (plan: any) => {
    setEditingId(plan.id);
    form.reset({
      ...plan,
      description: plan.description || ''
    });
    setIsDialogOpen(true);
  };

  const onSubmit = (data: z.infer<typeof planSchema>) => {
    if (editingId) {
      updatePlan.mutate({ planId: editingId, data }, {
        onSuccess: () => {
          toast({ title: "Success", description: "Plan updated successfully." });
          setIsDialogOpen(false);
          refetch();
        },
        onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" })
      });
    } else {
      createPlan.mutate({ data }, {
        onSuccess: () => {
          toast({ title: "Success", description: "Plan created successfully." });
          setIsDialogOpen(false);
          refetch();
        },
        onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" })
      });
    }
  };

  return (
    <AdminLayout>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white">Challenge Plans</h1>
          <p className="text-muted-foreground mt-1">Configure trading challenges and rules.</p>
        </div>
        
        <Button onClick={openCreateDialog} className="bg-amber-500 text-black hover:bg-amber-600 font-bold">
          <Plus className="h-4 w-4 mr-2" /> New Plan
        </Button>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="glass-card border-white/10 sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Challenge Plan" : "Create Challenge Plan"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="name" render={({ field }) => (
                  <FormItem><FormLabel>Name</FormLabel><FormControl><Input className="bg-black/50" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="slug" render={({ field }) => (
                  <FormItem><FormLabel>Slug</FormLabel><FormControl><Input className="bg-black/50" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="price_usd" render={({ field }) => (
                  <FormItem><FormLabel>Price (USD)</FormLabel><FormControl><Input type="number" className="bg-black/50" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="funded_sol" render={({ field }) => (
                  <FormItem><FormLabel>Funded Amount (SOL)</FormLabel><FormControl><Input type="number" className="bg-black/50" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                
                <FormField control={form.control} name="status" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl><SelectTrigger className="bg-black/50"><SelectValue placeholder="Select status" /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                        <SelectItem value="coming_soon">Coming Soon</SelectItem>
                        <SelectItem value="archived">Archived</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="display_order" render={({ field }) => (
                  <FormItem><FormLabel>Display Order</FormLabel><FormControl><Input type="number" className="bg-black/50" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              
              <FormField control={form.control} name="description" render={({ field }) => (
                <FormItem><FormLabel>Description (Optional)</FormLabel><FormControl><Textarea className="bg-black/50" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-white/5">
                <FormField control={form.control} name="profit_target_pct" render={({ field }) => (
                  <FormItem><FormLabel>Profit Target %</FormLabel><FormControl><Input type="number" className="bg-black/50" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="max_drawdown_pct" render={({ field }) => (
                  <FormItem><FormLabel>Max Drawdown %</FormLabel><FormControl><Input type="number" className="bg-black/50" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="daily_drawdown_pct" render={({ field }) => (
                  <FormItem><FormLabel>Daily Drawdown %</FormLabel><FormControl><Input type="number" className="bg-black/50" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="min_trading_days" render={({ field }) => (
                  <FormItem><FormLabel>Min Trading Days</FormLabel><FormControl><Input type="number" className="bg-black/50" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="max_position_size_pct" render={({ field }) => (
                  <FormItem><FormLabel>Max Pos Size %</FormLabel><FormControl><Input type="number" className="bg-black/50" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="max_open_positions" render={({ field }) => (
                  <FormItem><FormLabel>Max Open Pos</FormLabel><FormControl><Input type="number" className="bg-black/50" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>

              <DialogFooter className="pt-4">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                <Button type="submit" className="bg-amber-500 text-black hover:bg-amber-600" disabled={createPlan.isPending || updatePlan.isPending}>
                  {editingId ? 'Update Plan' : 'Create Plan'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Card className="glass-card border-white/10">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground animate-pulse">Loading plans...</div>
          ) : plans && plans.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase bg-black/40 border-b border-white/5">
                  <tr>
                    <th className="px-6 py-4 font-medium">Plan Details</th>
                    <th className="px-6 py-4 font-medium">Funded SOL</th>
                    <th className="px-6 py-4 font-medium">Price</th>
                    <th className="px-6 py-4 font-medium">Rules</th>
                    <th className="px-6 py-4 font-medium">Status</th>
                    <th className="px-6 py-4 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {plans.sort((a,b) => a.display_order - b.display_order).map((plan) => (
                    <tr key={plan.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-bold text-white text-base">{plan.name}</div>
                        <div className="text-xs text-muted-foreground font-mono">{plan.slug}</div>
                      </td>
                      <td className="px-6 py-4 font-bold text-amber-500">{plan.funded_sol} SOL</td>
                      <td className="px-6 py-4 font-medium text-white">${plan.price_usd}</td>
                      <td className="px-6 py-4 text-xs text-muted-foreground">
                        <div>PT: {plan.profit_target_pct}%</div>
                        <div>MDD: {plan.max_drawdown_pct}% | DDD: {plan.daily_drawdown_pct}%</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                          plan.status === 'active' ? 'text-green-500 bg-green-500/10 border-green-500/20' : 
                          plan.status === 'inactive' ? 'text-red-500 bg-red-500/10 border-red-500/20' :
                          'text-amber-500 bg-amber-500/10 border-amber-500/20'
                        }`}>
                          {plan.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Button variant="ghost" size="icon" onClick={() => openEditDialog(plan)} className="text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10">
                          <Edit2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8 text-center text-muted-foreground">
              No challenge plans configured.
            </div>
          )}
        </CardContent>
      </Card>
    </AdminLayout>
  );
}