import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axiosInstance from "../../axios";
import { 
  FiUser, FiShield, FiShoppingBag, FiActivity, 
  FiTruck, FiAlertCircle, FiCheckCircle, FiRefreshCw 
} from "react-icons/fi";
import { PulseLoader } from "react-spinners";

const TABS = [
  { id: "Account", icon: <FiUser /> },
  { id: "Security", icon: <FiShield /> },
  { id: "Shopify", icon: <FiShoppingBag /> },
  { id: "Meta Ads", icon: <FiActivity /> },
  { id: "Shiprocket", icon: <FiTruck /> }
];

export default function Settings() {
  const [activeTab, setActiveTab] = useState("Account");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  
  // Data States
  const [basic, setBasic] = useState({ firstName: "", lastName: "", email: "", businessName: "" });
  const [shopify, setShopify] = useState({ store: "", status: "" });
  const [meta, setMeta] = useState({ adAccountId: "", status: "", daysLeft: 0, isExpired: false });
  const [shiprocket, setShiprocket] = useState({ email: "", status: "", daysLeft: 0 });
  const [passwordData, setPasswordData] = useState({ oldPassword: "", newPassword: "", confirmPassword: "" });

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const res = await axiosInstance.get("/user/full-profile");
      const { data } = res;
      setBasic(data.basic);
      setShopify(data.shopify);
      setMeta(data.meta);
      setShiprocket(data.shiprocket);
    } catch (err) {
      console.error("Settings Load Error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (endpoint, payload) => {
    try {
      setActionLoading(true);
      await axiosInstance.put(endpoint, payload);
      alert("✅ Settings updated successfully!");
      fetchSettings(); // Refresh data
    } catch (err) {
      alert("❌ Update failed: " + (err.response?.data?.error || err.message));
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-screen bg-[#0a0a0a]">
      <PulseLoader color="#22c55e" size={10} />
      <span className="text-gray-500 text-xs font-bold mt-4 tracking-widest uppercase">Loading Preferences</span>
    </div>
  );

  return (
    <div className="p-6 lg:p-10 max-w-6xl mx-auto space-y-8 animate-in fade-in duration-700">
      <header>
        <h1 className="text-4xl font-black text-white tracking-tight">Settings</h1>
        <p className="text-gray-500 font-medium">Configure your ProfitFirst engine and integrations.</p>
      </header>

      {/* TABS SELECTOR */}
      <div className="flex flex-wrap gap-3 p-1 bg-[#161616] rounded-2xl w-max border border-gray-800">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all
              ${activeTab === tab.id ? "bg-white text-black shadow-lg" : "text-gray-400 hover:text-white hover:bg-gray-800"}
            `}
          >
            {tab.icon} {tab.id}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-8">
        
        {/* ACCOUNT TAB */}
        {activeTab === "Account" && (
          <div className="bg-[#161616] border border-gray-800 rounded-3xl p-8 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Business Name</label>
                <input type="text" value={basic.businessName} onChange={e => setBasic({...basic, businessName: e.target.value})} className="w-full bg-[#0a0a0a] border border-gray-800 rounded-xl px-4 py-3 text-white focus:border-green-500 outline-none transition-all" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Login Email</label>
                <input type="text" value={basic.email} disabled className="w-full bg-[#0a0a0a] border border-gray-800 rounded-xl px-4 py-3 text-gray-500 cursor-not-allowed" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">First Name</label>
                <input type="text" value={basic.firstName} onChange={e => setBasic({...basic, firstName: e.target.value})} className="w-full bg-[#0a0a0a] border border-gray-800 rounded-xl px-4 py-3 text-white focus:border-green-500 outline-none transition-all" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Last Name</label>
                <input type="text" value={basic.lastName} onChange={e => setBasic({...basic, lastName: e.target.value})} className="w-full bg-[#0a0a0a] border border-gray-800 rounded-xl px-4 py-3 text-white focus:border-green-500 outline-none transition-all" />
              </div>
            </div>
            <button onClick={() => handleUpdate("/user/profile/basic", basic)} className="bg-green-500 text-black font-black px-8 py-3 rounded-xl hover:scale-105 transition-all">Update Profile</button>
          </div>
        )}

        {/* SHOPIFY TAB */}
        {activeTab === "Shopify" && (
          <div className="bg-[#161616] border border-gray-800 rounded-3xl p-8 space-y-6">
            <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-white">Shopify Connection</h3>
                <span className="px-4 py-1 bg-green-500/10 text-green-500 rounded-full text-[10px] font-black uppercase tracking-widest border border-green-500/20">Active</span>
            </div>
            <div className="p-4 bg-[#0a0a0a] rounded-2xl border border-gray-800">
                <p className="text-xs text-gray-500 mb-1 font-bold uppercase tracking-widest">Connected Store</p>
                <p className="text-white font-mono text-lg">{shopify.store}</p>
            </div>
            <p className="text-gray-500 text-sm italic">Shopify connection is managed via OAuth. To change stores, please contact support.</p>
          </div>
        )}

        {/* META ADS TAB */}
        {activeTab === "Meta Ads" && (
          <div className="bg-[#161616] border border-gray-800 rounded-3xl p-8 space-y-6">
             <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-white">Meta Marketing API</h3>
                <div className={`px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${meta.isExpired ? 'bg-red-500/10 text-red-500 border-red-500/20' : 'bg-green-500/10 text-green-500 border-green-500/20'}`}>
                    {meta.isExpired ? 'Expired' : 'Healthy'}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="p-6 bg-[#0a0a0a] rounded-2xl border border-gray-800">
                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-4">Token Expiry</p>
                    <div className="flex items-end justify-between mb-2">
                        <span className="text-3xl font-black text-white">{meta.daysLeft}</span>
                        <span className="text-gray-500 text-xs font-bold uppercase">Days Remaining</span>
                    </div>
                    {/* Expiry Progress Bar */}
                    <div className="w-full bg-gray-900 h-2 rounded-full overflow-hidden">
                        <div className={`h-full transition-all duration-1000 ${meta.daysLeft < 10 ? 'bg-red-500' : 'bg-green-500'}`} style={{ width: `${(meta.daysLeft / 60) * 100}%` }}></div>
                    </div>
                </div>
                <div className="p-6 bg-[#0a0a0a] rounded-2xl border border-gray-800 space-y-2">
                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Ad Account ID</p>
                    <p className="text-white font-mono text-xl">{meta.adAccountId}</p>
                </div>
            </div>

            <button className="flex items-center gap-2 bg-blue-600 text-white font-black px-8 py-3 rounded-xl hover:bg-blue-700 transition-all">
                <FiRefreshCw /> Reconnect Meta Ads
            </button>
          </div>
        )}

        {/* SHIPROCKET TAB */}
        {activeTab === "Shiprocket" && (
          <div className="bg-[#161616] border border-gray-800 rounded-3xl p-8 space-y-6">
             <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-xl font-bold text-white">Shiprocket Logistics</h3>
                    <p className="text-green-500 text-[10px] font-black uppercase mt-1">✨ Managed by ProfitFirst Auto-Refresh</p>
                </div>
                <div className="px-4 py-1 bg-green-500/10 text-green-500 rounded-full text-[10px] font-black uppercase tracking-widest border border-green-500/20">Connected</div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="p-6 bg-[#0a0a0a] rounded-2xl border border-gray-800">
                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Account Email</p>
                    <p className="text-white font-mono text-lg mt-2">{shiprocket.email}</p>
                </div>
                <div className="p-6 bg-[#0a0a0a] rounded-2xl border border-gray-800">
                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-4">Token Life</p>
                    <div className="flex items-end justify-between mb-2">
                        <span className="text-3xl font-black text-white">{shiprocket.daysLeft}</span>
                        <span className="text-gray-500 text-xs font-bold uppercase">Days Left</span>
                    </div>
                    <div className="w-full bg-gray-900 h-2 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 transition-all duration-1000" style={{ width: `${(shiprocket.daysLeft / 10) * 100}%` }}></div>
                    </div>
                </div>
            </div>

            <div className="p-6 bg-green-500/5 border border-green-500/10 rounded-2xl">
                <p className="text-sm text-green-400 font-bold flex items-center gap-2">
                    <FiCheckCircle /> Automatic Token Refresh is ENABLED. 
                </p>
                <p className="text-xs text-gray-500 mt-1 ml-6">ProfitFirst uses your encrypted credentials to refresh tokens every 8 days. No action required.</p>
            </div>
          </div>
        )}

        {/* SECURITY TAB */}
        {activeTab === "Security" && (
          <div className="bg-[#161616] border border-gray-800 rounded-3xl p-8 space-y-6">
            <h3 className="text-xl font-bold text-white">Authentication Security</h3>
            <div className="space-y-4 max-w-md">
                <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Current Password</label>
                    <input type="password" value={passwordData.oldPassword} onChange={e => setPasswordData({...passwordData, oldPassword: e.target.value})} className="w-full bg-[#0a0a0a] border border-gray-800 rounded-xl px-4 py-3 text-white focus:border-green-500 outline-none" />
                </div>
                <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">New Password</label>
                    <input type="password" value={passwordData.newPassword} onChange={e => setPasswordData({...passwordData, newPassword: e.target.value})} className="w-full bg-[#0a0a0a] border border-gray-800 rounded-xl px-4 py-3 text-white focus:border-green-500 outline-none" />
                </div>
                <button onClick={() => handleUpdate("/auth/change-password", passwordData)} className="bg-white text-black font-black px-8 py-3 rounded-xl hover:scale-105 transition-all w-full">Change Password</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}