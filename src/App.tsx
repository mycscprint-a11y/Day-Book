import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, 
  LogOut, 
  LogIn, 
  Trash2, 
  TrendingUp, 
  Users, 
  Wallet, 
  Calendar,
  Search,
  ArrowUpRight,
  ArrowDownRight,
  Calculator,
  UserPlus,
  Store,
  Filter,
  ChevronRight,
  ChevronDown
} from 'lucide-react';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut, 
  User as FirebaseUser 
} from 'firebase/auth';
import { 
  collection, 
  addDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  deleteDoc, 
  doc, 
  setDoc, 
  getDoc,
  getDocFromServer,
  where
} from 'firebase/firestore';
import { 
  format, 
  startOfDay, 
  startOfWeek, 
  startOfMonth, 
  startOfYear, 
  isWithinInterval, 
  endOfDay,
  subDays
} from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { auth, db } from './firebase';
import { ErrorBoundary } from './components/ErrorBoundary';
import { cn } from './lib/utils';

// --- Types ---
interface Entry {
  id: string;
  date: string;
  clientId: string;
  clientName: string;
  vendorId: string;
  vendorName: string;
  quantity: number;
  rejectedQuantity: number;
  userRate: number;
  vendorRate: number;
  totalUserAmount: number;
  totalVendorAmount: number;
  profit: number;
  isRejected: boolean;
  createdBy: string;
  createdAt: string;
}

interface Client {
  id: string;
  name: string;
  phone?: string;
  defaultRate: number;
  createdAt: string;
}

interface Vendor {
  id: string;
  name: string;
  phone?: string;
  defaultRate: number;
  createdAt: string;
}

interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: 'admin' | 'user';
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

// --- Helpers ---
function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// --- Main Component ---
function PardaBook() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'entries' | 'clients' | 'vendors'>('entries');

  // Form States
  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedVendorId, setSelectedVendorId] = useState('');
  const [quantity, setQuantity] = useState<string>('');
  const [rejectedQuantity, setRejectedQuantity] = useState<string>('');
  const [entryDate, setEntryDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [submitting, setSubmitting] = useState(false);

  // Edit States
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);

  // Master Form States
  const [newClientName, setNewClientName] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');
  const [newClientRate, setNewClientRate] = useState('');
  
  const [newVendorName, setNewVendorName] = useState('');
  const [newVendorPhone, setNewVendorPhone] = useState('');
  const [newVendorRate, setNewVendorRate] = useState('');

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        const userRef = doc(db, 'users', currentUser.uid);
        try {
          const docSnap = await getDoc(userRef);
          if (!docSnap.exists()) {
            const newProfile: UserProfile = {
              uid: currentUser.uid,
              email: currentUser.email || '',
              displayName: currentUser.displayName || '',
              role: 'user',
            };
            await setDoc(userRef, newProfile);
            setProfile(newProfile);
          } else {
            setProfile(docSnap.data() as UserProfile);
          }
        } catch (error) {
          console.error("Error fetching profile:", error);
        }
      } else {
        setProfile(null);
      }
      setIsAuthReady(true);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // Data Listeners
  useEffect(() => {
    if (!isAuthReady || !user) return;

    const unsubEntries = onSnapshot(query(collection(db, 'entries'), orderBy('createdAt', 'desc')), (snapshot) => {
      setEntries(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Entry[]);
    });

    const unsubClients = onSnapshot(query(collection(db, 'clients'), orderBy('name', 'asc')), (snapshot) => {
      setClients(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Client[]);
    });

    const unsubVendors = onSnapshot(query(collection(db, 'vendors'), orderBy('name', 'asc')), (snapshot) => {
      setVendors(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Vendor[]);
    });

    return () => {
      unsubEntries();
      unsubClients();
      unsubVendors();
    };
  }, [isAuthReady, user]);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  const handleLogout = () => signOut(auth);

  const handleAddEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    const client = clients.find(c => c.id === selectedClientId);
    const vendor = vendors.find(v => v.id === selectedVendorId);

    if (!user || !client || !vendor || !quantity) return;

    setSubmitting(true);
    const qty = parseFloat(quantity);
    const rejQty = parseFloat(rejectedQuantity || '0');
    const netQty = qty - rejQty;
    const uRate = client.defaultRate;
    const vRate = vendor.defaultRate;
    const totalUser = netQty * uRate;
    const totalVendor = netQty * vRate;
    const profit = totalUser - totalVendor;

    try {
      if (editingEntry) {
        await setDoc(doc(db, 'entries', editingEntry.id), {
          ...editingEntry,
          date: entryDate,
          clientId: selectedClientId,
          clientName: client.name,
          vendorId: selectedVendorId,
          vendorName: vendor.name,
          quantity: qty,
          rejectedQuantity: rejQty,
          userRate: uRate,
          vendorRate: vRate,
          totalUserAmount: totalUser,
          totalVendorAmount: totalVendor,
          profit,
          isRejected: rejQty >= qty,
        });
        setEditingEntry(null);
      } else {
        await addDoc(collection(db, 'entries'), {
          date: entryDate,
          clientId: selectedClientId,
          clientName: client.name,
          vendorId: selectedVendorId,
          vendorName: vendor.name,
          quantity: qty,
          rejectedQuantity: rejQty,
          userRate: uRate,
          vendorRate: vRate,
          totalUserAmount: totalUser,
          totalVendorAmount: totalVendor,
          profit,
          isRejected: rejQty >= qty,
          createdBy: user.uid,
          createdAt: new Date().toISOString(),
        });
      }
      setQuantity('');
      setRejectedQuantity('');
      setSelectedClientId('');
      setSelectedVendorId('');
      setEntryDate(format(new Date(), 'yyyy-MM-dd'));
    } catch (error) {
      handleFirestoreError(error, editingEntry ? OperationType.UPDATE : OperationType.CREATE, 'entries');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClientName || !newClientRate) return;
    try {
      if (editingClient) {
        await setDoc(doc(db, 'clients', editingClient.id), {
          ...editingClient,
          name: newClientName,
          phone: newClientPhone,
          defaultRate: parseFloat(newClientRate),
        });
        setEditingClient(null);
      } else {
        await addDoc(collection(db, 'clients'), {
          name: newClientName,
          phone: newClientPhone,
          defaultRate: parseFloat(newClientRate),
          createdAt: new Date().toISOString()
        });
      }
      setNewClientName('');
      setNewClientPhone('');
      setNewClientRate('');
    } catch (error) {
      handleFirestoreError(error, editingClient ? OperationType.UPDATE : OperationType.CREATE, 'clients');
    }
  };

  const handleAddVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVendorName || !newVendorRate) return;
    try {
      if (editingVendor) {
        await setDoc(doc(db, 'vendors', editingVendor.id), {
          ...editingVendor,
          name: newVendorName,
          phone: newVendorPhone,
          defaultRate: parseFloat(newVendorRate),
        });
        setEditingVendor(null);
      } else {
        await addDoc(collection(db, 'vendors'), {
          name: newVendorName,
          phone: newVendorPhone,
          defaultRate: parseFloat(newVendorRate),
          createdAt: new Date().toISOString()
        });
      }
      setNewVendorName('');
      setNewVendorPhone('');
      setNewVendorRate('');
    } catch (error) {
      handleFirestoreError(error, editingVendor ? OperationType.UPDATE : OperationType.CREATE, 'vendors');
    }
  };

  const handleDeleteClient = async (id: string) => {
    if (!isAdmin() || !window.confirm('Delete this client? All their history will remain but they will be removed from masters.')) return;
    try {
      await deleteDoc(doc(db, 'clients', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `clients/${id}`);
    }
  };

  const handleDeleteVendor = async (id: string) => {
    if (!isAdmin() || !window.confirm('Delete this vendor?')) return;
    try {
      await deleteDoc(doc(db, 'vendors', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `vendors/${id}`);
    }
  };

  const isAdmin = () => profile?.role === 'admin' || user?.email === 'mycscprint@gmail.com';

  const startEditEntry = (entry: Entry) => {
    setEditingEntry(entry);
    setSelectedClientId(entry.clientId);
    setSelectedVendorId(entry.vendorId);
    setQuantity(entry.quantity.toString());
    setRejectedQuantity((entry.rejectedQuantity || 0).toString());
    setEntryDate(entry.date);
    setActiveTab('entries');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const startEditClient = (client: Client) => {
    setEditingClient(client);
    setNewClientName(client.name);
    setNewClientPhone(client.phone || '');
    setNewClientRate(client.defaultRate.toString());
    setActiveTab('clients');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const startEditVendor = (vendor: Vendor) => {
    setEditingVendor(vendor);
    setNewVendorName(vendor.name);
    setNewVendorPhone(vendor.phone || '');
    setNewVendorRate(vendor.defaultRate.toString());
    setActiveTab('vendors');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteEntry = async (id: string) => {
    if (!window.confirm('Delete this entry?')) return;
    try {
      await deleteDoc(doc(db, 'entries', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `entries/${id}`);
    }
  };

  const stats = useMemo(() => {
    const now = new Date();
    const intervals = {
      day: { start: startOfDay(now), end: endOfDay(now) },
      week: { start: startOfWeek(now), end: now },
      month: { start: startOfMonth(now), end: now },
      year: { start: startOfYear(now), end: now },
    };

    const calculateStats = (start: Date, end: Date) => {
      return entries
        .filter(e => !e.isRejected && isWithinInterval(new Date(e.createdAt), { start, end }))
        .reduce((acc, curr) => ({
          user: acc.user + curr.totalUserAmount,
          vendor: acc.vendor + curr.totalVendorAmount,
          profit: acc.profit + curr.profit,
        }), { user: 0, vendor: 0, profit: 0 });
    };

    return {
      today: calculateStats(intervals.day.start, intervals.day.end),
      week: calculateStats(intervals.week.start, intervals.week.end),
      month: calculateStats(intervals.month.start, intervals.month.end),
      year: calculateStats(intervals.year.start, intervals.year.end),
    };
  }, [entries]);

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-zinc-50">Loading...</div>;

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 p-4">
        <div className="max-w-md w-full bg-white border border-zinc-200 rounded-2xl p-8 shadow-sm text-center">
          <Calculator className="w-12 h-12 mx-auto mb-4 text-zinc-900" />
          <h1 className="text-2xl font-bold mb-6">Parda Book Manager</h1>
          <button onClick={handleLogin} className="w-full py-3 bg-zinc-900 text-white rounded-xl font-bold flex items-center justify-center gap-2">
            <LogIn className="w-5 h-5" /> Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <header className="bg-white border-b border-zinc-200 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-xl">
            <Calculator className="w-6 h-6" /> Parda Book
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium hidden sm:inline">{user.displayName}</span>
            <button onClick={handleLogout} className="p-2 hover:bg-zinc-100 rounded-lg"><LogOut className="w-5 h-5" /></button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Today Profit', value: stats.today.profit, color: 'text-emerald-600' },
            { label: 'This Week', value: stats.week.profit, color: 'text-blue-600' },
            { label: 'This Month', value: stats.month.profit, color: 'text-indigo-600' },
            { label: 'This Year', value: stats.year.profit, color: 'text-purple-600' },
          ].map((s, i) => (
            <div key={i} className="bg-white p-5 rounded-2xl border border-zinc-200 shadow-sm">
              <div className="text-xs font-bold text-zinc-500 uppercase mb-1">{s.label}</div>
              <div className={cn("text-2xl font-bold", s.color)}>₹{(s.value || 0).toLocaleString()}</div>
            </div>
          ))}
        </div>

        {/* Navigation Tabs */}
        <div className="flex gap-2 mb-8 bg-zinc-200/50 p-1 rounded-xl w-fit">
          {[
            { id: 'entries', label: 'Entries', icon: Calculator },
            { id: 'clients', label: 'Users (Clients)', icon: UserPlus },
            { id: 'vendors', label: 'Vendors', icon: Store },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all",
                activeTab === tab.id ? "bg-white shadow-sm text-zinc-900" : "text-zinc-500 hover:text-zinc-700"
              )}
            >
              <tab.icon className="w-4 h-4" /> {tab.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column: Forms */}
          <div className="lg:col-span-4 space-y-6">
            {activeTab === 'entries' && (
              <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm">
                <h2 className="text-lg font-bold mb-6 flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    {editingEntry ? <TrendingUp className="w-5 h-5 text-blue-600" /> : <Plus className="w-5 h-5" />}
                    {editingEntry ? 'Edit Entry' : 'New Entry'}
                  </span>
                  {editingEntry && (
                    <button 
                      onClick={() => {
                        setEditingEntry(null);
                        setQuantity('');
                        setRejectedQuantity('');
                        setSelectedClientId('');
                        setSelectedVendorId('');
                        setEntryDate(format(new Date(), 'yyyy-MM-dd'));
                      }}
                      className="text-xs font-bold text-red-600 hover:underline"
                    >
                      Cancel
                    </button>
                  )}
                </h2>
                <form onSubmit={handleAddEntry} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-zinc-500 uppercase mb-1">Entry Date</label>
                    <input
                      required
                      type="date"
                      value={entryDate}
                      onChange={(e) => setEntryDate(e.target.value)}
                      className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-2 focus:ring-zinc-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-zinc-500 uppercase mb-1">Select User (Client)</label>
                    <select
                      required
                      value={selectedClientId}
                      onChange={(e) => setSelectedClientId(e.target.value)}
                      className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-2 focus:ring-zinc-900"
                    >
                      <option value="">Choose User...</option>
                      {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-zinc-500 uppercase mb-1">Select Vendor</label>
                    <select
                      required
                      value={selectedVendorId}
                      onChange={(e) => setSelectedVendorId(e.target.value)}
                      className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-2 focus:ring-zinc-900"
                    >
                      <option value="">Choose Vendor...</option>
                      {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-zinc-500 uppercase mb-1">Total Entry (Quantity)</label>
                    <input
                      required
                      type="number"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      placeholder="e.g. 100"
                      className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-2 focus:ring-zinc-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-zinc-500 uppercase mb-1">Rejected Entry</label>
                    <input
                      type="number"
                      value={rejectedQuantity}
                      onChange={(e) => setRejectedQuantity(e.target.value)}
                      placeholder="e.g. 5"
                      className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-2 focus:ring-zinc-900"
                    />
                  </div>

                  {selectedClientId && selectedVendorId && (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-xl">
                        <div className="text-[10px] font-bold text-zinc-400 uppercase">User Rate</div>
                        <div className="text-sm font-bold">₹{clients.find(c => c.id === selectedClientId)?.defaultRate}</div>
                      </div>
                      <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-xl">
                        <div className="text-[10px] font-bold text-zinc-400 uppercase">Vendor Rate</div>
                        <div className="text-sm font-bold">₹{vendors.find(v => v.id === selectedVendorId)?.defaultRate}</div>
                      </div>
                    </div>
                  )}

                  {quantity && selectedClientId && selectedVendorId && (
                    <div className={cn("p-4 rounded-xl space-y-2 transition-colors bg-zinc-900 text-white")}>
                      <div className="flex justify-between text-xs opacity-70">
                        <span>Net Quantity:</span>
                        <span>{parseFloat(quantity || '0') - parseFloat(rejectedQuantity || '0')}</span>
                      </div>
                      <div className="flex justify-between text-xs opacity-70">
                        <span>Total User Amount:</span>
                        <span>₹{((parseFloat(quantity || '0') - parseFloat(rejectedQuantity || '0')) * (clients.find(c => c.id === selectedClientId)?.defaultRate || 0)).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-xs opacity-70">
                        <span>Total Vendor Amount:</span>
                        <span>₹{((parseFloat(quantity || '0') - parseFloat(rejectedQuantity || '0')) * (vendors.find(v => v.id === selectedVendorId)?.defaultRate || 0)).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between font-bold border-t border-white/10 pt-2">
                        <span>Net Profit:</span>
                        <span className="text-emerald-400">₹{((parseFloat(quantity || '0') - parseFloat(rejectedQuantity || '0')) * ((clients.find(c => c.id === selectedClientId)?.defaultRate || 0) - (vendors.find(v => v.id === selectedVendorId)?.defaultRate || 0))).toLocaleString()}</span>
                      </div>
                    </div>
                  )}

                  <button disabled={submitting} className="w-full py-3 bg-zinc-900 text-white rounded-xl font-bold hover:bg-zinc-800 transition-all disabled:opacity-50">
                    {submitting ? 'Saving...' : (editingEntry ? 'Update Entry' : 'Add Entry')}
                  </button>
                </form>
              </div>
            )}

            {activeTab === 'clients' && (
              <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm">
                <h2 className="text-lg font-bold mb-6 flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    {editingClient ? <UserPlus className="w-5 h-5 text-blue-600" /> : <UserPlus className="w-5 h-5" />}
                    {editingClient ? 'Edit User' : 'Add New User'}
                  </span>
                  {editingClient && (
                    <button 
                      onClick={() => {
                        setEditingClient(null);
                        setNewClientName('');
                        setNewClientPhone('');
                        setNewClientRate('');
                      }}
                      className="text-xs font-bold text-red-600 hover:underline"
                    >
                      Cancel
                    </button>
                  )}
                </h2>
                <form onSubmit={handleAddClient} className="space-y-4">
                  <input
                    required
                    value={newClientName}
                    onChange={(e) => setNewClientName(e.target.value)}
                    placeholder="User Name"
                    className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-2 focus:ring-zinc-900"
                  />
                  <input
                    value={newClientPhone}
                    onChange={(e) => setNewClientPhone(e.target.value)}
                    placeholder="Mobile Number (Optional)"
                    className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-2 focus:ring-zinc-900"
                  />
                  <input
                    required
                    type="number"
                    value={newClientRate}
                    onChange={(e) => setNewClientRate(e.target.value)}
                    placeholder="Default User Rate"
                    className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-2 focus:ring-zinc-900"
                  />
                  <button className="w-full py-3 bg-zinc-900 text-white rounded-xl font-bold hover:bg-zinc-800 transition-all">
                    {editingClient ? 'Update User' : 'Add User'}
                  </button>
                </form>
              </div>
            )}

            {activeTab === 'vendors' && (
              <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm">
                <h2 className="text-lg font-bold mb-6 flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    {editingVendor ? <Store className="w-5 h-5 text-blue-600" /> : <Store className="w-5 h-5" />}
                    {editingVendor ? 'Edit Vendor' : 'Add New Vendor'}
                  </span>
                  {editingVendor && (
                    <button 
                      onClick={() => {
                        setEditingVendor(null);
                        setNewVendorName('');
                        setNewVendorPhone('');
                        setNewVendorRate('');
                      }}
                      className="text-xs font-bold text-red-600 hover:underline"
                    >
                      Cancel
                    </button>
                  )}
                </h2>
                <form onSubmit={handleAddVendor} className="space-y-4">
                  <input
                    required
                    value={newVendorName}
                    onChange={(e) => setNewVendorName(e.target.value)}
                    placeholder="Vendor Name"
                    className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-2 focus:ring-zinc-900"
                  />
                  <input
                    value={newVendorPhone}
                    onChange={(e) => setNewVendorPhone(e.target.value)}
                    placeholder="Mobile Number (Optional)"
                    className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-2 focus:ring-zinc-900"
                  />
                  <input
                    required
                    type="number"
                    value={newVendorRate}
                    onChange={(e) => setNewVendorRate(e.target.value)}
                    placeholder="Default Vendor Rate"
                    className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-2 focus:ring-zinc-900"
                  />
                  <button className="w-full py-3 bg-zinc-900 text-white rounded-xl font-bold hover:bg-zinc-800 transition-all">
                    {editingVendor ? 'Update Vendor' : 'Add Vendor'}
                  </button>
                </form>
              </div>
            )}
          </div>

          {/* Right Column: Lists */}
          <div className="lg:col-span-8">
            <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-zinc-100 flex items-center justify-between">
                <h2 className="text-lg font-bold">
                  {activeTab === 'entries' ? 'Recent Entries' : activeTab === 'clients' ? 'User List' : 'Vendor List'}
                </h2>
                {activeTab === 'entries' && (
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                    <input
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Search..."
                      className="pl-10 pr-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-zinc-900 outline-none w-48 sm:w-64"
                    />
                  </div>
                )}
              </div>

              <div className="overflow-x-auto">
                {activeTab === 'entries' ? (
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-zinc-50/50 text-xs font-bold text-zinc-500 uppercase tracking-wider">
                        <th className="px-6 py-4">Date</th>
                        <th className="px-6 py-4">User / Vendor</th>
                        <th className="px-6 py-4 text-right">Qty</th>
                        <th className="px-6 py-4 text-right">User Amt</th>
                        <th className="px-6 py-4 text-right">Vendor Amt</th>
                        <th className="px-6 py-4 text-right">Profit</th>
                        <th className="px-6 py-4"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {entries.filter(e => 
                        (e.clientName?.toLowerCase() || '').includes(searchTerm.toLowerCase()) || 
                        (e.vendorName?.toLowerCase() || '').includes(searchTerm.toLowerCase())
                      ).map(entry => (
                        <tr key={entry.id} className={cn("hover:bg-zinc-50 transition-colors group", entry.isRejected && "bg-red-50/30")}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-500">
                            {format(new Date(entry.createdAt), 'dd MMM')}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <div className="text-sm font-bold">{entry.clientName}</div>
                              {entry.isRejected && <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-bold uppercase">Rejected</span>}
                            </div>
                            <div className="text-xs text-zinc-500 flex items-center gap-1"><Store className="w-3 h-3" /> {entry.vendorName}</div>
                          </td>
                          <td className="px-6 py-4 text-right text-sm font-mono">
                            <div>{entry.quantity}</div>
                            {entry.rejectedQuantity > 0 && (
                              <div className="text-[10px] text-red-500">-{entry.rejectedQuantity} rej</div>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right text-sm font-mono font-bold">₹{(entry.totalUserAmount || 0).toLocaleString()}</td>
                          <td className="px-6 py-4 text-right text-sm font-mono">₹{(entry.totalVendorAmount || 0).toLocaleString()}</td>
                          <td className="px-6 py-4 text-right">
                            <span className={cn("text-sm font-mono font-bold", entry.isRejected ? "text-zinc-400 line-through" : (entry.profit >= 0 ? "text-emerald-600" : "text-red-600"))}>
                              ₹{(entry.profit || 0).toLocaleString()}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
                              <button onClick={() => startEditEntry(entry)} className="p-2 text-zinc-400 hover:text-blue-600">
                                <TrendingUp className="w-4 h-4" />
                              </button>
                              <button onClick={() => handleDeleteEntry(entry.id)} className="p-2 text-zinc-400 hover:text-red-600">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {(activeTab === 'clients' ? clients : vendors).map(item => (
                      <div key={item.id} className="p-4 bg-zinc-50 border border-zinc-200 rounded-xl group">
                        <div className="flex justify-between items-start mb-2">
                          <span className="font-bold">{item.name}</span>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                            <button 
                              onClick={() => activeTab === 'clients' ? startEditClient(item as Client) : startEditVendor(item as Vendor)} 
                              className="p-1 text-zinc-400 hover:text-blue-600"
                            >
                              <TrendingUp className="w-3 h-3" />
                            </button>
                            <button 
                              onClick={() => activeTab === 'clients' ? handleDeleteClient(item.id) : handleDeleteVendor(item.id)} 
                              className="p-1 text-zinc-400 hover:text-red-600"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-zinc-500">{item.phone || 'No Phone'}</span>
                          <span className="font-bold text-zinc-900">Rate: ₹{item.defaultRate}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <PardaBook />
    </ErrorBoundary>
  );
}
