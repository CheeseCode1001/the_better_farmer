import { useState, useRef, useEffect } from 'react';
import { 
  Sprout, 
  Send, 
  Camera, 
  Mic, 
  Volume2, 
  VolumeX, 
  Languages, 
  AlertTriangle, 
  Calendar, 
  Droplets,
  User,
  Bot,
  Loader2,
  X,
  LayoutDashboard,
  CloudSun,
  Settings,
  LogOut,
  MapPin,
  ChevronRight,
  CheckCircle2,
  Plus,
  Home as HomeIcon,
  BookOpen,
  ClipboardList,
  Trophy,
  Search,
  Wind,
  Thermometer,
  CloudRain,
  ArrowUpRight,
  TrendingUp,
  Clock,
  CheckCircle,
  Circle,
  MoreVertical,
  ChevronDown,
  Info,
  Play,
  Award,
  Zap,
  Lightbulb
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar
} from 'recharts';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

import { chatWithAgro } from '@/src/lib/gemini';
import { auth, signInWithGoogle, logout, db } from '@/src/lib/firebase';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, setDoc, collection, onSnapshot, query, orderBy, addDoc, serverTimestamp } from 'firebase/firestore';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  image?: string;
  timestamp: number;
}

interface Farm {
  id: string;
  name: string;
  cropType: string;
  category: 'crops' | 'livestock' | 'mixed';
  size: string;
  location: string;
  items?: string[];
}

interface Task {
  id: string;
  title: string;
  date: string;
  completed: boolean;
  priority: 'low' | 'medium' | 'high';
}

interface Article {
  id: string;
  title: string;
  category: string;
  image: string;
  readTime: string;
}

const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'fr', name: 'Français' },
  { code: 'ha', name: 'Hausa' },
  { code: 'tw', name: 'Twi' },
  { code: 'wo', name: 'Wolof' },
  { code: 'yo', name: 'Yoruba' },
];

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [activeTab, setActiveTab] = useState('home');
  const [location, setLocation] = useState<{lat: number, lng: number} | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isAddingFarm, setIsAddingFarm] = useState(false);
  const [newFarmCategory, setNewFarmCategory] = useState<'crops' | 'livestock' | 'mixed'>('crops');
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  
  // Chat state
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  
  // Farm state
  const [farms, setFarms] = useState<Farm[]>([]);
  const [selectedFarm, setSelectedFarm] = useState<Farm | null>(null);
  
  // Planner state
  const [tasks, setTasks] = useState<Task[]>([
    { id: '1', title: 'Apply fertilizer to North Field', date: '2026-04-10', completed: false, priority: 'high' },
    { id: '2', title: 'Check irrigation system', date: '2026-04-11', completed: false, priority: 'medium' },
    { id: '3', title: 'Harvest tomatoes', date: '2026-04-12', completed: false, priority: 'low' },
  ]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        if (userDoc.exists()) {
          setUserProfile(userDoc.data());
        } else {
          // New user
          setUserProfile(null);
        }
      }
      setIsAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Location Listener
  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition((position) => {
        setLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude
        });
      }, (error) => {
        console.error("Location error:", error);
      });
    }

    // Handle initial sidebar state for tablet/mobile
    const handleResize = () => {
      if (window.innerWidth < 1024) {
        setIsSidebarCollapsed(true);
      } else {
        setIsSidebarCollapsed(false);
      }
    };
    
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Fetch Chat Messages
  useEffect(() => {
    if (!user || activeTab !== 'advisor') return;
    
    // For simplicity, we use a single chat session per user for now
    const q = query(
      collection(db, 'users', user.uid, 'chats', 'default', 'messages'),
      orderBy('timestamp', 'asc')
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Message[];
      
      if (msgs.length === 0) {
        setMessages([{
          id: '1',
          role: 'assistant',
          content: "Hello! I am AgroAdvisor, your village extension officer. How are your crops doing today?",
          timestamp: Date.now()
        }]);
      } else {
        setMessages(msgs);
      }
    });
    
    return () => unsubscribe();
  }, [user, activeTab]);

  // Fetch Farms
  useEffect(() => {
    if (!user || activeTab !== 'farm') return;
    
    const unsubscribe = onSnapshot(collection(db, 'users', user.uid, 'farms'), (snapshot) => {
      setFarms(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Farm[]);
    });
    
    return () => unsubscribe();
  }, [user, activeTab]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleLogin = async () => {
    if (isLoggingIn) return;
    setIsLoggingIn(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleOnboardingComplete = async (data: any) => {
    if (!user) return;
    const profile = {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      onboardingCompleted: true,
      preferredLanguage: data.language,
      location: location,
      createdAt: serverTimestamp()
    };
    await setDoc(doc(db, 'users', user.uid), profile);
    setUserProfile(profile);
  };

  const handleSend = async () => {
    if (!input.trim() && !capturedImage) return;
    if (!user) return;

    const msgContent = input;
    const msgImage = capturedImage;
    
    setInput('');
    setCapturedImage(null);
    setIsLoading(true);

    const messageData = {
      role: 'user',
      content: msgContent,
      image: msgImage || null,
      timestamp: Date.now()
    };

    // Save user message to Firestore
    await addDoc(collection(db, 'users', user.uid, 'chats', 'default', 'messages'), messageData);

    const history = messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

    const response = await chatWithAgro(msgContent, history, msgImage || undefined);
    
    // Save assistant response to Firestore
    await addDoc(collection(db, 'users', user.uid, 'chats', 'default', 'messages'), {
      role: 'assistant',
      content: response || "I'm sorry, I couldn't process that.",
      timestamp: Date.now()
    });

    setIsLoading(false);
    speak(response || "");
  };

  const speak = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = userProfile?.preferredLanguage === 'fr' ? 'fr-FR' : 'en-GB'; 
      window.speechSynthesis.speak(utterance);
    }
  };

  const startListening = () => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.lang = userProfile?.preferredLanguage === 'fr' ? 'fr-FR' : 'en-US';
      recognition.onstart = () => setIsListening(true);
      recognition.onend = () => setIsListening(false);
      recognition.onresult = (event: any) => setInput(event.results[0][0].transcript);
      recognition.start();
    }
  };

  const startCamera = async () => {
    setShowCamera(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (err) {
      setShowCamera(false);
    }
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      if (context) {
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
        context.drawImage(videoRef.current, 0, 0);
        setCapturedImage(canvasRef.current.toDataURL('image/jpeg'));
        stopCamera();
      }
    }
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
    }
    setShowCamera(false);
  };

  // Splash Screen
  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-primary flex flex-col items-center justify-center text-primary-foreground">
        <motion.div 
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, repeat: Infinity, repeatType: 'reverse' }}
        >
          <Sprout className="w-24 h-24 mb-4" />
        </motion.div>
        <h1 className="text-4xl font-bold tracking-tighter">AgroSave</h1>
        <p className="mt-2 opacity-80 font-medium">Cultivating a better tomorrow...</p>
      </div>
    );
  }

  // Auth Screen
  if (!user) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full opacity-5 pointer-events-none">
          <div className="absolute top-10 left-10 w-64 h-64 bg-primary rounded-full blur-3xl" />
          <div className="absolute bottom-10 right-10 w-96 h-96 bg-accent rounded-full blur-3xl" />
        </div>
        
        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="z-10 flex flex-col items-center"
        >
          <div className="bg-primary/10 p-8 rounded-[2.5rem] mb-8 shadow-inner border border-primary/20">
            <Sprout className="w-24 h-24 text-primary" />
          </div>
          <h1 className="text-5xl font-bold tracking-tight mb-4 text-foreground">AgroSave</h1>
          <p className="text-muted-foreground mb-12 max-w-sm text-lg leading-relaxed">
            The all-in-one platform for modern farmers. Manage, plan, and grow with AI-powered insights.
          </p>
          <Button size="lg" onClick={handleLogin} disabled={isLoggingIn} className="w-full max-w-xs gap-3 py-8 text-xl rounded-3xl shadow-xl hover:shadow-primary/20 transition-all">
            {isLoggingIn ? <Loader2 className="w-6 h-6 animate-spin" /> : <img src="https://www.google.com/favicon.ico" className="w-6 h-6" alt="Google" />}
            {isLoggingIn ? 'Signing in...' : 'Get Started'}
          </Button>
          <p className="mt-8 text-sm text-muted-foreground">
            Trusted by over 50,000 farmers worldwide.
          </p>
        </motion.div>
      </div>
    );
  }

  // Onboarding Screen
  if (!userProfile?.onboardingCompleted) {
    const onboardingSteps = [
      {
        title: "Welcome to AgroSave",
        description: "Your digital partner for sustainable and profitable farming.",
        icon: Sprout,
        color: "bg-primary"
      },
      {
        title: "AI-Powered Advice",
        description: "Get instant diagnosis and expert guidance for your crops and livestock.",
        icon: Bot,
        color: "bg-accent"
      },
      {
        title: "Smart Planning",
        description: "Organize your farm activities and never miss a critical task again.",
        icon: ClipboardList,
        color: "bg-blue-500"
      }
    ];

    return (
      <div className="min-h-screen bg-background p-6 flex flex-col items-center justify-center relative overflow-hidden">
        <div className="w-full max-w-lg z-10">
          <div className="flex justify-between mb-12 gap-2">
            {[0, 1, 2, 3].map((s) => (
              <div key={s} className={`h-2 flex-1 rounded-full transition-all duration-500 ${onboardingStep >= s ? 'bg-primary' : 'bg-muted'}`} />
            ))}
          </div>

          <AnimatePresence mode="wait">
            {onboardingStep < 3 ? (
              <motion.div 
                key={`step${onboardingStep}`}
                initial={{ x: 50, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -50, opacity: 0 }}
                className="text-center space-y-8"
              >
                <div className={`w-32 h-32 ${onboardingSteps[onboardingStep].color}/10 rounded-[2.5rem] flex items-center justify-center mx-auto border border-primary/10`}>
                  {(() => {
                    const Icon = onboardingSteps[onboardingStep].icon;
                    return <Icon className={`w-16 h-16 ${onboardingSteps[onboardingStep].color.replace('bg-', 'text-')}`} />;
                  })()}
                </div>
                <div className="space-y-4">
                  <h2 className="text-4xl font-bold tracking-tight">{onboardingSteps[onboardingStep].title}</h2>
                  <p className="text-xl text-muted-foreground leading-relaxed">{onboardingSteps[onboardingStep].description}</p>
                </div>
                <Button size="lg" className="w-full py-8 text-xl rounded-3xl" onClick={() => setOnboardingStep(s => s + 1)}>
                  Continue
                </Button>
              </motion.div>
            ) : (
              <motion.div 
                key="step3"
                initial={{ x: 50, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -50, opacity: 0 }}
                className="space-y-8"
              >
                <div className="text-center">
                  <h2 className="text-4xl font-bold tracking-tight mb-4">Final Step</h2>
                  <p className="text-xl text-muted-foreground">Choose your preferred language for agricultural advice.</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {LANGUAGES.map(lang => (
                    <Button 
                      key={lang.code} 
                      variant="outline" 
                      className="h-20 text-xl rounded-3xl border-2 hover:border-primary hover:bg-primary/5 transition-all"
                      onClick={() => {
                        handleOnboardingComplete({ language: lang.code });
                      }}
                    >
                      {lang.name}
                    </Button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background flex flex-col md:flex-row font-sans text-foreground">
        
        {/* Desktop Sidebar */}
        <aside className={`hidden md:flex flex-col border-r bg-card p-4 transition-all duration-300 relative ${isSidebarCollapsed ? 'w-24' : 'w-72'}`}>
          <div className="flex items-center gap-3 mb-8 px-2">
            <div className="bg-primary p-2.5 rounded-2xl shadow-lg shadow-primary/20 shrink-0">
              <Sprout className="text-primary-foreground w-7 h-7" />
            </div>
            {!isSidebarCollapsed && (
              <motion.h1 
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="font-bold text-2xl tracking-tight text-foreground whitespace-nowrap"
              >
                AgroSave
              </motion.h1>
            )}
          </div>

          <nav className="flex-1 flex flex-col gap-1.5">
            {[
              { id: 'home', icon: HomeIcon, label: 'Dashboard' },
              { id: 'advisor', icon: Bot, label: 'AI Advisor' },
              { id: 'farm', icon: LayoutDashboard, label: 'My Farm' },
              { id: 'planner', icon: ClipboardList, label: 'Planner' },
              { id: 'learning', icon: BookOpen, label: 'Learning' },
              { id: 'weather', icon: CloudSun, label: 'Weather' },
              { id: 'profile', icon: Trophy, label: 'Profile' },
              { id: 'settings', icon: Settings, label: 'Settings' },
            ].map((item) => (
              <Tooltip key={item.id}>
                <TooltipTrigger render={
                  <button
                    onClick={() => setActiveTab(item.id)}
                    className={`flex items-center gap-3.5 h-13 rounded-2xl text-base font-medium transition-all w-full px-4 ${activeTab === item.id ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20' : 'hover:bg-primary/5 text-muted-foreground'}`}
                  />
                }>
                  <item.icon className={`w-5.5 h-5.5 shrink-0 ${activeTab === item.id ? 'text-primary-foreground' : 'text-muted-foreground'}`} />
                  {!isSidebarCollapsed && <span className="whitespace-nowrap">{item.label}</span>}
                </TooltipTrigger>
                {isSidebarCollapsed && <TooltipContent side="right">{item.label}</TooltipContent>}
              </Tooltip>
            ))}
          </nav>

          <div className="pt-6 border-t">
            <div className="flex items-center gap-3 mb-4 p-2 rounded-2xl hover:bg-muted/50 transition-colors cursor-pointer overflow-hidden" onClick={() => setActiveTab('profile')}>
              <Avatar className="w-11 h-11 border-2 border-primary/20 shrink-0">
                <AvatarImage src={user.photoURL || ''} />
                <AvatarFallback className="bg-primary/10 text-primary font-bold">{user.displayName?.[0]}</AvatarFallback>
              </Avatar>
              {!isSidebarCollapsed && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex-1 overflow-hidden"
                >
                  <p className="font-bold text-sm truncate text-foreground">{user.displayName}</p>
                  <div className="flex items-center gap-1">
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-primary/5 border-primary/20 text-primary">Pro Farmer</Badge>
                  </div>
                </motion.div>
              )}
            </div>
            <Button 
              variant="ghost" 
              className={`w-full justify-start gap-3.5 text-destructive hover:text-destructive hover:bg-destructive/10 rounded-2xl h-12 ${isSidebarCollapsed ? 'px-4' : ''}`} 
              onClick={logout}
            >
              <LogOut className="w-5.5 h-5.5 shrink-0" />
              {!isSidebarCollapsed && <span>Logout</span>}
            </Button>
          </div>

          {/* Toggle Button */}
          <button 
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className="absolute -right-3 top-20 bg-card border-2 rounded-full p-1 shadow-md hover:bg-muted transition-colors z-20 hidden lg:block"
          >
            <ChevronRight className={`w-4 h-4 transition-transform duration-300 ${isSidebarCollapsed ? '' : 'rotate-180'}`} />
          </button>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 flex flex-col h-screen overflow-hidden relative bg-background/50">
          
          {/* Mobile Header */}
          <header className="md:hidden sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b p-4 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="bg-primary p-1.5 rounded-xl">
                <Sprout className="text-primary-foreground w-5 h-5" />
              </div>
              <h1 className="font-bold text-xl tracking-tight">AgroSave</h1>
            </div>
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setActiveTab('learning')}
                className={`p-2 rounded-xl transition-all ${activeTab === 'learning' ? 'bg-primary/10 text-primary' : 'text-muted-foreground'}`}
              >
                <Lightbulb className={`w-6 h-6 ${activeTab === 'learning' ? 'fill-primary/20' : ''}`} />
              </button>
              <Avatar className="w-9 h-9 border-2 border-primary/20 shadow-sm" onClick={() => setActiveTab('profile')}>
                <AvatarImage src={user.photoURL || ''} />
                <AvatarFallback className="bg-primary/10 text-primary font-bold">{user.displayName?.[0]}</AvatarFallback>
              </Avatar>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">
            {activeTab === 'home' && (
              <div className="max-w-6xl mx-auto space-y-8 pb-20 md:pb-0">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-3xl font-bold tracking-tight">Hello, {user.displayName?.split(' ')[0]}!</h2>
                    <p className="text-muted-foreground text-lg">Here's what's happening on your farm today.</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="bg-card border rounded-2xl p-3 flex items-center gap-3 shadow-sm">
                      <div className="bg-blue-500/10 p-2 rounded-xl">
                        <CloudRain className="w-5 h-5 text-blue-500" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground font-medium uppercase">Rain Chance</p>
                        <p className="font-bold">24%</p>
                      </div>
                    </div>
                    <div className="bg-card border rounded-2xl p-3 flex items-center gap-3 shadow-sm">
                      <div className="bg-orange-500/10 p-2 rounded-xl">
                        <Thermometer className="w-5 h-5 text-orange-500" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground font-medium uppercase">Temp</p>
                        <p className="font-bold">28°C</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <Card className="md:col-span-2 rounded-[2rem] border-2 shadow-sm overflow-hidden">
                    <CardHeader className="pb-2">
                      <div className="flex justify-between items-center">
                        <CardTitle className="text-xl">Yield Forecast</CardTitle>
                        <Badge className="bg-primary/10 text-primary border-none">Monthly</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="h-[250px] pt-4">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={[
                          { name: 'Jan', yield: 400 },
                          { name: 'Feb', yield: 300 },
                          { name: 'Mar', yield: 600 },
                          { name: 'Apr', yield: 800 },
                          { name: 'May', yield: 500 },
                          { name: 'Jun', yield: 900 },
                        ]}>
                          <defs>
                            <linearGradient id="colorYield" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="var(--primary)" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 12}} />
                          <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12}} />
                          <RechartsTooltip 
                            contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                          />
                          <Area type="monotone" dataKey="yield" stroke="var(--primary)" strokeWidth={3} fillOpacity={1} fill="url(#colorYield)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <Card className="rounded-[2rem] border-2 shadow-sm bg-primary text-primary-foreground relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-20">
                      <Trophy className="w-32 h-32 rotate-12" />
                    </div>
                    <CardHeader>
                      <CardTitle className="text-xl">Achievements</CardTitle>
                      <CardDescription className="text-primary-foreground/70">You're in the top 5% of farmers this month!</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <div className="flex items-center gap-4">
                        <div className="bg-white/20 p-3 rounded-2xl">
                          <Award className="w-6 h-6" />
                        </div>
                        <div>
                          <p className="font-bold">Soil Master</p>
                          <p className="text-xs opacity-70">Perfect pH levels maintained</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="bg-white/20 p-3 rounded-2xl">
                          <Zap className="w-6 h-6" />
                        </div>
                        <div>
                          <p className="font-bold">Fast Responder</p>
                          <p className="text-xs opacity-70">Pest alert handled in 2h</p>
                        </div>
                      </div>
                      <Button variant="secondary" className="w-full rounded-2xl font-bold">View All</Button>
                    </CardContent>
                  </Card>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Card className="rounded-[2rem] border-2 shadow-sm">
                    <CardHeader>
                      <div className="flex justify-between items-center">
                        <CardTitle className="text-xl">Upcoming Tasks</CardTitle>
                        <Button variant="ghost" size="sm" className="text-primary font-bold" onClick={() => setActiveTab('planner')}>View All</Button>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {tasks.slice(0, 3).map(task => (
                        <div key={task.id} className="flex items-center gap-4 p-3 rounded-2xl hover:bg-muted/50 transition-colors group">
                          <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${task.completed ? 'bg-primary border-primary' : 'border-muted-foreground/30'}`}>
                            {task.completed && <CheckCircle className="w-4 h-4 text-white" />}
                          </div>
                          <div className="flex-1">
                            <p className={`font-medium ${task.completed ? 'line-through text-muted-foreground' : ''}`}>{task.title}</p>
                            <p className="text-xs text-muted-foreground">{task.date}</p>
                          </div>
                          <Badge variant="outline" className={`capitalize ${task.priority === 'high' ? 'text-red-500 bg-red-50' : task.priority === 'medium' ? 'text-orange-500 bg-orange-50' : 'text-blue-500 bg-blue-50'}`}>
                            {task.priority}
                          </Badge>
                        </div>
                      ))}
                    </CardContent>
                  </Card>

                  <Card className="rounded-[2rem] border-2 shadow-sm">
                    <CardHeader>
                      <div className="flex justify-between items-center">
                        <CardTitle className="text-xl">Recent Activity</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <div className="relative pl-8 space-y-8 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-0.5 before:bg-muted">
                        <div className="relative">
                          <div className="absolute -left-8 top-1 w-6 h-6 rounded-full bg-primary flex items-center justify-center border-4 border-background">
                            <div className="w-1.5 h-1.5 rounded-full bg-white" />
                          </div>
                          <p className="text-sm font-bold">New Farm Added</p>
                          <p className="text-xs text-muted-foreground">2 hours ago • North Field</p>
                        </div>
                        <div className="relative">
                          <div className="absolute -left-8 top-1 w-6 h-6 rounded-full bg-accent flex items-center justify-center border-4 border-background">
                            <div className="w-1.5 h-1.5 rounded-full bg-white" />
                          </div>
                          <p className="text-sm font-bold">AI Diagnosis Complete</p>
                          <p className="text-xs text-muted-foreground">Yesterday • Tomato Blight identified</p>
                        </div>
                        <div className="relative">
                          <div className="absolute -left-8 top-1 w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center border-4 border-background">
                            <div className="w-1.5 h-1.5 rounded-full bg-white" />
                          </div>
                          <p className="text-sm font-bold">Task Completed</p>
                          <p className="text-xs text-muted-foreground">2 days ago • Irrigation check</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}

            {activeTab === 'advisor' && (
              <div className="h-full flex flex-col max-w-4xl mx-auto gap-4 pb-20 md:pb-0">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h2 className="text-2xl font-bold tracking-tight">AI Advisor</h2>
                    <p className="text-sm text-muted-foreground">Ask anything about your crops or livestock.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="rounded-xl gap-2">
                      <Languages className="w-4 h-4" />
                      {LANGUAGES.find(l => l.code === userProfile?.preferredLanguage)?.name}
                    </Button>
                  </div>
                </div>

                <ScrollArea className="flex-1 pr-4" ref={scrollRef}>
                  <div className="flex flex-col gap-6 pb-4">
                    {messages.length === 1 && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                        {[
                          "How do I treat tomato blight?",
                          "Best time to plant maize in Lagos?",
                          "How to improve soil fertility naturally?",
                          "Signs of armyworm infestation?"
                        ].map((q, i) => (
                          <Button 
                            key={i} 
                            variant="outline" 
                            className="h-auto py-4 px-4 justify-start text-left rounded-2xl border-2 hover:border-primary hover:bg-primary/5 transition-all group"
                            onClick={() => {
                              setInput(q);
                              // Auto-send if we want, or just set input
                            }}
                          >
                            <div className="flex items-center gap-3">
                              <div className="bg-primary/10 p-2 rounded-xl group-hover:bg-primary group-hover:text-white transition-colors">
                                <Search className="w-4 h-4" />
                              </div>
                              <span className="text-sm font-medium">{q}</span>
                            </div>
                          </Button>
                        ))}
                      </div>
                    )}

                    {messages.map((m) => (
                      <div key={m.id} className={`flex gap-4 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
                        <Avatar className={`w-12 h-12 border-2 shadow-sm ${m.role === 'user' ? 'border-accent' : 'border-primary'}`}>
                          <AvatarFallback className={m.role === 'user' ? 'bg-accent text-accent-foreground font-bold' : 'bg-primary text-primary-foreground font-bold'}>
                            {m.role === 'user' ? <User className="w-6 h-6" /> : <Bot className="w-6 h-6" />}
                          </AvatarFallback>
                        </Avatar>
                        <div className={`flex flex-col gap-1.5 max-w-[85%] ${m.role === 'user' ? 'items-end' : ''}`}>
                          <div className={`p-5 rounded-[1.5rem] shadow-sm leading-relaxed ${m.role === 'user' ? 'bg-accent text-accent-foreground rounded-tr-none' : 'bg-card border rounded-tl-none'}`}>
                            {m.image && <img src={m.image} className="rounded-xl mb-4 max-w-full border-2 border-white/20 shadow-md" alt="Crop" />}
                            <div className="prose prose-sm max-w-none dark:prose-invert">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                            </div>
                          </div>
                          <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest px-2">
                            {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>
                    ))}
                    {isLoading && (
                      <div className="flex gap-4">
                        <Avatar className="w-12 h-12 border-2 border-primary shadow-sm"><AvatarFallback className="bg-primary font-bold"><Bot className="w-6 h-6 text-white" /></AvatarFallback></Avatar>
                        <div className="bg-card border p-5 rounded-[1.5rem] rounded-tl-none flex items-center gap-3 shadow-sm">
                          <Loader2 className="w-5 h-5 animate-spin text-primary" />
                          <span className="text-sm font-medium italic text-muted-foreground">AgroSave is thinking...</span>
                        </div>
                      </div>
                    )}
                  </div>
                </ScrollArea>

                <div className="flex flex-col gap-3 pt-2">
                  <AnimatePresence>
                    {capturedImage && (
                      <motion.div 
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.8, opacity: 0 }}
                        className="relative w-24 h-24"
                      >
                        <img src={capturedImage} className="w-full h-full object-cover rounded-2xl border-4 border-white shadow-xl" alt="Preview" />
                        <button onClick={() => setCapturedImage(null)} className="absolute -top-3 -right-3 bg-destructive text-white rounded-full p-1.5 shadow-lg border-2 border-white">
                          <X className="w-4 h-4" />
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  
                  <div className="flex items-center gap-2 bg-card border-2 p-2.5 rounded-[2rem] shadow-xl focus-within:border-primary/50 transition-all">
                    <Tooltip>
                      <TooltipTrigger render={<button className="inline-flex shrink-0 items-center justify-center rounded-full w-12 h-12 hover:bg-primary/10 hover:text-primary transition-all outline-none" onClick={startCamera} />}>
                        <Camera className="w-6 h-6" />
                      </TooltipTrigger>
                      <TooltipContent>Capture Photo</TooltipContent>
                    </Tooltip>
                    
                    <Input 
                      placeholder="Type your question here..." 
                      value={input} 
                      onChange={(e) => setInput(e.target.value)} 
                      onKeyDown={(e) => e.key === 'Enter' && handleSend()} 
                      className="border-none focus-visible:ring-0 bg-transparent text-lg h-12" 
                    />
                    
                    <div className="flex items-center gap-1">
                      <Tooltip>
                        <TooltipTrigger render={
                          <button 
                            onClick={startListening} 
                            className={`inline-flex shrink-0 items-center justify-center rounded-full w-12 h-12 transition-all outline-none ${isListening ? 'bg-red-500 text-white animate-pulse' : 'hover:bg-primary/10 hover:text-primary'}`}
                          />
                        }>
                          <Mic className="w-6 h-6" />
                        </TooltipTrigger>
                        <TooltipContent>{isListening ? 'Listening...' : 'Voice Input'}</TooltipContent>
                      </Tooltip>
                      
                      <Button 
                        onClick={handleSend} 
                        disabled={(!input.trim() && !capturedImage) || isLoading}
                        className="rounded-full w-12 h-12 shadow-lg shadow-primary/20"
                      >
                        <Send className="w-5 h-5" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'farm' && (
              <div className="max-w-6xl mx-auto space-y-8 pb-20 md:pb-0">
                <AnimatePresence mode="wait">
                  {!selectedFarm ? (
                    <motion.div 
                      key="farmlist"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                      className="space-y-8"
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <h2 className="text-3xl font-bold tracking-tight">My Farm Records</h2>
                          <p className="text-muted-foreground">Manage your fields and livestock in one place.</p>
                        </div>
                        <Dialog open={isAddingFarm} onOpenChange={setIsAddingFarm}>
                          <DialogTrigger render={<button className="inline-flex shrink-0 items-center justify-center bg-primary text-primary-foreground gap-2 rounded-2xl h-12 px-6 shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all outline-none font-medium" />}>
                            <Plus className="w-5 h-5" /> Add Farm
                          </DialogTrigger>
                          <DialogContent className="rounded-[2rem]">
                            <DialogHeader>
                              <DialogTitle className="text-2xl">Add New Farm Record</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-6 py-4">
                              <div className="space-y-2">
                                <label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Farm Name</label>
                                <Input placeholder="e.g. North Field" id="farmName" className="h-12 rounded-xl" />
                              </div>
                              <div className="space-y-2">
                                <label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Category</label>
                                <div className="grid grid-cols-3 gap-2">
                                  {['crops', 'livestock', 'mixed'].map(cat => (
                                    <Button 
                                      key={cat} 
                                      variant={newFarmCategory === cat ? 'default' : 'outline'} 
                                      className="capitalize rounded-xl h-12" 
                                      onClick={() => setNewFarmCategory(cat as any)}
                                    >
                                      {cat}
                                    </Button>
                                  ))}
                                </div>
                              </div>
                              <div className="space-y-2">
                                <label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Primary Focus</label>
                                <Input placeholder="e.g. Maize or Poultry" id="cropType" className="h-12 rounded-xl" />
                              </div>
                              <Button className="w-full h-14 text-lg rounded-2xl shadow-lg" onClick={async () => {
                                const name = (document.getElementById('farmName') as HTMLInputElement).value;
                                const crop = (document.getElementById('cropType') as HTMLInputElement).value;
                                if (name && crop && user) {
                                  await addDoc(collection(db, 'users', user.uid, 'farms'), {
                                    name, 
                                    cropType: crop, 
                                    category: newFarmCategory, 
                                    size: 'Small', 
                                    location: location?.lat ? `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}` : 'Lagos, NG', 
                                    createdAt: serverTimestamp(),
                                    items: []
                                  });
                                  setIsAddingFarm(false);
                                }
                              }}>Save Farm Record</Button>
                            </div>
                          </DialogContent>
                        </Dialog>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {farms.length === 0 ? (
                          <div className="col-span-full py-24 text-center border-4 border-dashed rounded-[3rem] bg-muted/20">
                            <div className="bg-primary/10 w-20 h-20 rounded-[2rem] flex items-center justify-center mx-auto mb-6">
                              <Sprout className="w-10 h-10 text-primary" />
                            </div>
                            <p className="text-2xl font-bold">No farm records yet</p>
                            <p className="text-muted-foreground max-w-xs mx-auto mt-2">Add your first farm to start tracking its health and production.</p>
                            <Button variant="outline" className="mt-8 rounded-2xl h-12 px-8 border-2" onClick={() => setIsAddingFarm(true)}>
                              Create Record
                            </Button>
                          </div>
                        ) : (
                          farms.map(farm => (
                            <Card 
                              key={farm.id} 
                              className="rounded-[2.5rem] overflow-hidden border-2 hover:border-primary/50 transition-all cursor-pointer group shadow-sm hover:shadow-xl"
                              onClick={() => setSelectedFarm(farm)}
                            >
                              <div className="h-32 bg-primary/5 relative overflow-hidden">
                                <div className="absolute inset-0 opacity-10">
                                  <Sprout className="w-48 h-48 -bottom-10 -right-10 absolute rotate-12" />
                                </div>
                                <div className="absolute top-4 right-4">
                                  <Badge className="bg-white/80 backdrop-blur-md text-primary border-none shadow-sm capitalize px-3 py-1">
                                    {farm.category || 'Crops'}
                                  </Badge>
                                </div>
                              </div>
                              <CardHeader className="pt-6">
                                <CardTitle className="text-2xl group-hover:text-primary transition-colors">{farm.name}</CardTitle>
                                <CardDescription className="flex items-center gap-1.5">
                                  <MapPin className="w-3.5 h-3.5" /> {farm.location}
                                </CardDescription>
                              </CardHeader>
                              <CardContent className="pb-8">
                                <div className="flex items-center justify-between p-4 bg-muted/50 rounded-[1.5rem]">
                                  <div className="flex items-center gap-3">
                                    <div className="bg-primary/10 p-2 rounded-xl">
                                      <TrendingUp className="w-4 h-4 text-primary" />
                                    </div>
                                    <div>
                                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Status</p>
                                      <p className="text-sm font-bold">Healthy</p>
                                    </div>
                                  </div>
                                  <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:translate-x-1 transition-transform" />
                                </div>
                              </CardContent>
                            </Card>
                          ))
                        )}
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div 
                      key="farmdetail"
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="space-y-8"
                    >
                      <div className="flex items-center gap-4">
                        <Button variant="ghost" size="icon" className="rounded-full hover:bg-primary/10" onClick={() => setSelectedFarm(null)}>
                          <X className="w-6 h-6" />
                        </Button>
                        <div>
                          <h2 className="text-3xl font-bold tracking-tight">{selectedFarm.name}</h2>
                          <p className="text-muted-foreground">{selectedFarm.cropType} • {selectedFarm.location}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <Card className="md:col-span-2 rounded-[2.5rem] border-2 p-8">
                          <div className="flex justify-between items-center mb-8">
                            <h3 className="text-xl font-bold">Current {selectedFarm.category === 'livestock' ? 'Livestock' : 'Crops'}</h3>
                            <Dialog open={isAddingItem} onOpenChange={setIsAddingItem}>
                              <DialogTrigger render={<button className="inline-flex shrink-0 items-center justify-center bg-primary text-primary-foreground rounded-xl gap-2 h-10 px-4 hover:bg-primary/90 transition-all outline-none font-medium" />}>
                                <Plus className="w-4 h-4" /> Add Item
                              </DialogTrigger>
                              <DialogContent className="rounded-[2rem]">
                                <DialogHeader>
                                  <DialogTitle>Add to {selectedFarm.name}</DialogTitle>
                                </DialogHeader>
                                <div className="space-y-4 py-4">
                                  <Input placeholder={`e.g. ${selectedFarm.category === 'livestock' ? 'Cattle' : 'Maize'}`} id="newItemName" className="h-12 rounded-xl" />
                                  <Button className="w-full h-12 rounded-xl" onClick={async () => {
                                    const name = (document.getElementById('newItemName') as HTMLInputElement).value;
                                    if (name && user) {
                                      const updatedItems = [...(selectedFarm.items || []), name];
                                      await setDoc(doc(db, 'users', user.uid, 'farms', selectedFarm.id), {
                                        ...selectedFarm,
                                        items: updatedItems
                                      });
                                      setSelectedFarm({ ...selectedFarm, items: updatedItems });
                                      setIsAddingItem(false);
                                    }
                                  }}>Add Item</Button>
                                </div>
                              </DialogContent>
                            </Dialog>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                            {(selectedFarm.items && selectedFarm.items.length > 0 ? selectedFarm.items : ['Maize', 'Cassava', 'Yam']).map((item, i) => (
                              <div key={i} className="bg-muted/30 p-6 rounded-[2rem] border-2 border-transparent hover:border-primary/20 transition-all text-center group">
                                <div className="bg-white w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm group-hover:scale-110 transition-transform">
                                  <Sprout className="w-6 h-6 text-primary" />
                                </div>
                                <p className="font-bold">{item}</p>
                                <p className="text-xs text-muted-foreground mt-1">Planted 2mo ago</p>
                              </div>
                            ))}
                          </div>
                        </Card>

                        <Card className="rounded-[2.5rem] border-2 bg-accent/5 p-8 border-accent/20">
                          <h3 className="text-xl font-bold mb-6">Farm Insights</h3>
                          <div className="space-y-6">
                            <div className="flex items-center gap-4">
                              <div className="bg-accent/20 p-3 rounded-2xl">
                                <Droplets className="w-6 h-6 text-accent" />
                              </div>
                              <div>
                                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Soil Moisture</p>
                                <p className="text-lg font-bold">68% <span className="text-xs font-normal text-green-600">(Optimal)</span></p>
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                              <div className="bg-primary/20 p-3 rounded-2xl">
                                <Thermometer className="w-6 h-6 text-primary" />
                              </div>
                              <div>
                                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Soil Temp</p>
                                <p className="text-lg font-bold">24.5°C</p>
                              </div>
                            </div>
                            <div className="pt-4">
                              <Button variant="outline" className="w-full rounded-2xl border-2 border-accent/20 text-accent hover:bg-accent/10">
                                Run Full Diagnosis
                              </Button>
                            </div>
                          </div>
                        </Card>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {activeTab === 'planner' && (
              <div className="max-w-4xl mx-auto space-y-8 pb-20 md:pb-0">
                <div className="flex justify-between items-center">
                  <div>
                    <h2 className="text-3xl font-bold tracking-tight">Farm Planner</h2>
                    <p className="text-muted-foreground">Stay organized and never miss a critical task.</p>
                  </div>
                  <Dialog open={isAddingTask} onOpenChange={setIsAddingTask}>
                    <DialogTrigger render={<button className="inline-flex shrink-0 items-center justify-center bg-primary text-primary-foreground rounded-2xl h-12 px-6 gap-2 shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all outline-none font-medium" />}>
                      <Plus className="w-5 h-5" /> New Task
                    </DialogTrigger>
                    <DialogContent className="rounded-[2rem]">
                      <DialogHeader>
                        <DialogTitle>Create New Task</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <Input placeholder="Task description..." id="newTaskTitle" className="h-12 rounded-xl" />
                        <Input type="date" id="newTaskDate" className="h-12 rounded-xl" defaultValue={new Date().toISOString().split('T')[0]} />
                        <div className="flex gap-2">
                          {['low', 'medium', 'high'].map(p => (
                            <Button key={p} variant="outline" className="flex-1 capitalize rounded-xl" id={`priority-${p}`}>{p}</Button>
                          ))}
                        </div>
                        <Button className="w-full h-12 rounded-xl" onClick={() => {
                          const title = (document.getElementById('newTaskTitle') as HTMLInputElement).value;
                          const date = (document.getElementById('newTaskDate') as HTMLInputElement).value;
                          if (title && date) {
                            setTasks([...tasks, { id: Date.now().toString(), title, date, completed: false, priority: 'medium' }]);
                            setIsAddingTask(false);
                          }
                        }}>Save Task</Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  <div className="md:col-span-1 space-y-4">
                    <Card className="rounded-[2rem] border-2 p-6">
                      <h3 className="font-bold mb-4">Filters</h3>
                      <div className="space-y-2">
                        {['All', 'Today', 'Upcoming', 'Completed'].map(f => (
                          <Button key={f} variant={f === 'All' ? 'secondary' : 'ghost'} className="w-full justify-start rounded-xl">{f}</Button>
                        ))}
                      </div>
                    </Card>
                    <Card className="rounded-[2rem] border-2 p-6 bg-primary/5 border-primary/20">
                      <div className="flex items-center gap-2 text-primary mb-2">
                        <Info className="w-4 h-4" />
                        <p className="text-xs font-bold uppercase">Pro Tip</p>
                      </div>
                      <p className="text-sm">Regular weeding in the first 4 weeks increases yield by up to 30%.</p>
                    </Card>
                  </div>

                  <div className="md:col-span-3 space-y-4">
                    {tasks.map(task => (
                      <Card key={task.id} className="rounded-[1.5rem] border-2 p-5 hover:border-primary/30 transition-all group">
                        <div className="flex items-center gap-4">
                          <button 
                            className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all ${task.completed ? 'bg-primary border-primary' : 'border-muted-foreground/30 hover:border-primary'}`}
                            onClick={() => {
                              setTasks(tasks.map(t => t.id === task.id ? { ...t, completed: !t.completed } : t));
                            }}
                          >
                            {task.completed && <CheckCircle className="w-5 h-5 text-white" />}
                          </button>
                          <div className="flex-1">
                            <h4 className={`font-bold text-lg ${task.completed ? 'line-through text-muted-foreground' : ''}`}>{task.title}</h4>
                            <div className="flex items-center gap-4 mt-1">
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <Calendar className="w-3.5 h-3.5" />
                                {task.date}
                              </div>
                              <Badge variant="outline" className={`text-[10px] uppercase tracking-widest px-2 py-0.5 border-none ${task.priority === 'high' ? 'bg-red-100 text-red-600' : task.priority === 'medium' ? 'bg-orange-100 text-orange-600' : 'bg-blue-100 text-blue-600'}`}>
                                {task.priority}
                              </Badge>
                            </div>
                          </div>
                          <Button variant="ghost" size="icon" className="rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                            <MoreVertical className="w-5 h-5" />
                          </Button>
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'learning' && (
              <div className="max-w-6xl mx-auto space-y-8 pb-20 md:pb-0">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div>
                    <h2 className="text-3xl font-bold tracking-tight">Agricultural Knowledge Base</h2>
                    <p className="text-muted-foreground">Learn best practices and innovative techniques.</p>
                  </div>
                  <div className="relative w-full md:w-80">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input placeholder="Search guides, crops..." className="pl-12 h-12 rounded-2xl border-2" />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  {[
                    { title: "Sustainable Irrigation", category: "Water Management", image: "https://picsum.photos/seed/water/800/600", readTime: "5 min" },
                    { title: "Organic Pest Control", category: "Crop Protection", image: "https://picsum.photos/seed/pest/800/600", readTime: "8 min" },
                    { title: "Soil Health Secrets", category: "Soil Science", image: "https://picsum.photos/seed/soil/800/600", readTime: "6 min" },
                    { title: "Poultry Best Practices", category: "Livestock", image: "https://picsum.photos/seed/chicken/800/600", readTime: "10 min" },
                    { title: "Market Price Trends", category: "Economics", image: "https://picsum.photos/seed/market/800/600", readTime: "4 min" },
                    { title: "Climate-Smart Farming", category: "Innovation", image: "https://picsum.photos/seed/climate/800/600", readTime: "7 min" },
                  ].map((article, i) => (
                    <Card key={i} className="rounded-[2.5rem] overflow-hidden border-2 group hover:shadow-xl transition-all">
                      <div className="h-48 relative overflow-hidden">
                        <img src={article.image} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" alt={article.title} referrerPolicy="no-referrer" />
                        <div className="absolute top-4 left-4">
                          <Badge className="bg-white/90 backdrop-blur-md text-primary border-none shadow-sm">{article.category}</Badge>
                        </div>
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <Button variant="secondary" className="rounded-full gap-2">
                            <Play className="w-4 h-4 fill-current" /> Watch Video
                          </Button>
                        </div>
                      </div>
                      <CardContent className="p-6">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                          <Clock className="w-3.5 h-3.5" /> {article.readTime} read
                        </div>
                        <h3 className="text-xl font-bold group-hover:text-primary transition-colors leading-tight">{article.title}</h3>
                        <p className="text-sm text-muted-foreground mt-3 line-clamp-2">Discover the latest techniques used by successful farmers to maximize yield while preserving natural resources.</p>
                        <Button variant="link" className="p-0 h-auto mt-4 text-primary font-bold gap-1">
                          Read Full Guide <ArrowUpRight className="w-4 h-4" />
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'weather' && (
              <div className="max-w-6xl mx-auto space-y-8 pb-20 md:pb-0">
                <div className="flex justify-between items-center">
                  <div>
                    <h2 className="text-3xl font-bold tracking-tight">Weather & Environment</h2>
                    <p className="text-muted-foreground">Real-time tracking for your farm's micro-climate.</p>
                  </div>
                  <Button variant="outline" className="rounded-xl gap-2 h-12 border-2">
                    <MapPin className="w-4 h-4" /> {location ? `${location.lat.toFixed(2)}, ${location.lng.toFixed(2)}` : 'Detecting...'}
                  </Button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  <div className="lg:col-span-2 space-y-8">
                    <Card className="rounded-[2.5rem] border-2 overflow-hidden bg-primary text-primary-foreground p-10 relative">
                      <div className="absolute top-0 right-0 p-10 opacity-20">
                        <CloudSun className="w-48 h-48" />
                      </div>
                      <div className="relative z-10 flex flex-col md:flex-row justify-between gap-8">
                        <div className="space-y-4">
                          <Badge className="bg-white/20 text-white border-none px-4 py-1 text-sm">Live Conditions</Badge>
                          <h3 className="text-7xl font-bold tracking-tighter">32°C</h3>
                          <div className="space-y-1">
                            <p className="text-2xl font-medium">Partly Cloudy</p>
                            <p className="opacity-80">Lagos, Nigeria • Feels like 35°C</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-6">
                          <div className="bg-white/10 p-4 rounded-2xl backdrop-blur-md border border-white/10">
                            <Wind className="w-6 h-6 mb-2" />
                            <p className="text-xs opacity-70 uppercase font-bold">Wind</p>
                            <p className="text-lg font-bold">12 km/h</p>
                          </div>
                          <div className="bg-white/10 p-4 rounded-2xl backdrop-blur-md border border-white/10">
                            <Droplets className="w-6 h-6 mb-2" />
                            <p className="text-xs opacity-70 uppercase font-bold">Humidity</p>
                            <p className="text-lg font-bold">64%</p>
                          </div>
                          <div className="bg-white/10 p-4 rounded-2xl backdrop-blur-md border border-white/10">
                            <CloudRain className="w-6 h-6 mb-2" />
                            <p className="text-xs opacity-70 uppercase font-bold">Rain</p>
                            <p className="text-lg font-bold">0.2 mm</p>
                          </div>
                          <div className="bg-white/10 p-4 rounded-2xl backdrop-blur-md border border-white/10">
                            <TrendingUp className="w-6 h-6 mb-2" />
                            <p className="text-xs opacity-70 uppercase font-bold">Pressure</p>
                            <p className="text-lg font-bold">1012 hPa</p>
                          </div>
                        </div>
                      </div>
                    </Card>

                    <Card className="rounded-[2.5rem] border-2 overflow-hidden h-[400px] relative group">
                      <div className="absolute inset-0 bg-muted">
                        <iframe 
                          width="100%" 
                          height="100%" 
                          frameBorder="0" 
                          scrolling="no" 
                          marginHeight={0} 
                          marginWidth={0} 
                          src={`https://www.openstreetmap.org/export/embed.html?bbox=${(location?.lng || 3.37) - 0.05}%2C${(location?.lat || 6.52) - 0.05}%2C${(location?.lng || 3.37) + 0.05}%2C${(location?.lat || 6.52) + 0.05}&layer=mapnik&marker=${location?.lat || 6.52}%2C${location?.lng || 3.37}`}
                          className="opacity-80 grayscale-[0.2] contrast-[1.1]"
                        />
                      </div>
                      <div className="absolute top-6 left-6 bg-white/90 backdrop-blur-md p-4 rounded-2xl shadow-xl border-2 border-primary/20">
                        <div className="flex items-center gap-3">
                          <div className="w-3 h-3 bg-red-500 rounded-full animate-ping" />
                          <p className="font-bold">Live Tracking Enabled</p>
                        </div>
                      </div>
                      <div className="absolute bottom-6 right-6 flex flex-col gap-2">
                        <Button size="icon" className="rounded-xl shadow-xl"><Plus className="w-5 h-5" /></Button>
                        <Button size="icon" variant="secondary" className="rounded-xl shadow-xl"><X className="w-5 h-5" /></Button>
                      </div>
                    </Card>
                  </div>

                  <div className="space-y-6">
                    <Card className="rounded-[2.5rem] border-2 p-8">
                      <h3 className="text-xl font-bold mb-6">7-Day Forecast</h3>
                      <div className="space-y-6">
                        {[
                          { day: 'Mon', temp: '32°', icon: CloudSun, label: 'Cloudy' },
                          { day: 'Tue', temp: '34°', icon: Thermometer, label: 'Sunny' },
                          { day: 'Wed', temp: '29°', icon: CloudRain, label: 'Rainy' },
                          { day: 'Thu', temp: '31°', icon: Wind, label: 'Windy' },
                          { day: 'Fri', temp: '33°', icon: CloudSun, label: 'Cloudy' },
                          { day: 'Sat', temp: '35°', icon: Thermometer, label: 'Sunny' },
                          { day: 'Sun', temp: '32°', icon: CloudSun, label: 'Cloudy' },
                        ].map((d, i) => (
                          <div key={i} className="flex items-center justify-between group">
                            <p className="font-bold w-10">{d.day}</p>
                            <div className="flex items-center gap-3 flex-1 px-4">
                              <d.icon className="w-5 h-5 text-primary" />
                              <p className="text-sm text-muted-foreground">{d.label}</p>
                            </div>
                            <p className="font-bold text-lg">{d.temp}</p>
                          </div>
                        ))}
                      </div>
                    </Card>

                    <Card className="rounded-[2.5rem] border-2 bg-accent/10 border-accent/20 p-8">
                      <div className="flex items-center gap-3 text-accent mb-4">
                        <AlertTriangle className="w-6 h-6" />
                        <h3 className="text-xl font-bold">Weather Alert</h3>
                      </div>
                      <p className="text-sm font-medium leading-relaxed">Heavy rainfall expected in the next 48 hours. Ensure proper drainage in North Field and protect young seedlings.</p>
                      <Button variant="outline" className="w-full mt-6 rounded-2xl border-2 border-accent/20 text-accent hover:bg-accent/10">
                        View Safety Guide
                      </Button>
                    </Card>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'profile' && (
              <div className="max-w-5xl mx-auto space-y-8 pb-20 md:pb-0">
                <div className="relative h-48 rounded-[3rem] bg-gradient-to-r from-primary to-accent overflow-hidden">
                  <div className="absolute inset-0 opacity-20">
                    <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white via-transparent to-transparent" />
                  </div>
                </div>
                
                <div className="px-8 -mt-24 relative z-10">
                  <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                    <div className="flex flex-col md:flex-row items-center md:items-end gap-6">
                      <Avatar className="w-40 h-40 border-8 border-background shadow-2xl rounded-[3rem]">
                        <AvatarImage src={user.photoURL || ''} />
                        <AvatarFallback className="text-4xl font-bold bg-primary/10 text-primary">{user.displayName?.[0]}</AvatarFallback>
                      </Avatar>
                      <div className="text-center md:text-left pb-4">
                        <h2 className="text-4xl font-bold tracking-tight">{user.displayName}</h2>
                        <p className="text-muted-foreground text-lg flex items-center justify-center md:justify-start gap-2">
                          <MapPin className="w-5 h-5" /> Lagos, Nigeria
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-3 pb-4">
                      <Button className="rounded-2xl h-12 px-8 shadow-lg shadow-primary/20">Edit Profile</Button>
                      <Button variant="outline" size="icon" className="rounded-2xl h-12 w-12 border-2"><Settings className="w-5 h-5" /></Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-12">
                    <Card className="rounded-[2.5rem] border-2 p-8 text-center space-y-2">
                      <div className="bg-primary/10 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4">
                        <Trophy className="w-8 h-8 text-primary" />
                      </div>
                      <h3 className="text-3xl font-bold">Level 12</h3>
                      <p className="text-muted-foreground font-medium uppercase tracking-widest text-xs">Master Farmer</p>
                      <div className="w-full bg-muted h-2 rounded-full mt-4">
                        <div className="bg-primary h-full rounded-full w-[75%]" />
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-2">2,450 XP to Level 13</p>
                    </Card>

                    <Card className="rounded-[2.5rem] border-2 p-8 text-center space-y-2">
                      <div className="bg-accent/10 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4">
                        <TrendingUp className="w-8 h-8 text-accent" />
                      </div>
                      <h3 className="text-3xl font-bold">1,240kg</h3>
                      <p className="text-muted-foreground font-medium uppercase tracking-widest text-xs">Total Harvest</p>
                      <p className="text-xs text-green-600 font-bold mt-4 flex items-center justify-center gap-1">
                        <ArrowUpRight className="w-3 h-3" /> +12% from last month
                      </p>
                    </Card>

                    <Card className="rounded-[2.5rem] border-2 p-8 text-center space-y-2">
                      <div className="bg-blue-500/10 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4">
                        <Award className="w-8 h-8 text-blue-500" />
                      </div>
                      <h3 className="text-3xl font-bold">24</h3>
                      <p className="text-muted-foreground font-medium uppercase tracking-widest text-xs">Badges Earned</p>
                      <p className="text-xs text-muted-foreground mt-4">Top 1% in your region</p>
                    </Card>
                  </div>

                  <div className="mt-12 space-y-8">
                    <h3 className="text-2xl font-bold">Accomplishments</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                      {[
                        { name: "Early Bird", icon: CloudSun, color: "bg-orange-500" },
                        { name: "Water Saver", icon: Droplets, color: "bg-blue-500" },
                        { name: "Pest Hunter", icon: AlertTriangle, color: "bg-red-500" },
                        { name: "Green Thumb", icon: Sprout, color: "bg-green-500" },
                      ].map((badge, i) => (
                        <div key={i} className="bg-card border-2 rounded-[2rem] p-6 text-center group hover:border-primary/30 transition-all">
                          <div className={`${badge.color}/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform`}>
                            <badge.icon className={`w-8 h-8 ${badge.color.replace('bg-', 'text-')}`} />
                          </div>
                          <p className="font-bold">{badge.name}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'settings' && (
              <div className="max-w-3xl mx-auto space-y-8 pb-20 md:pb-0">
                <h2 className="text-3xl font-bold tracking-tight">Settings</h2>
                <div className="space-y-6">
                  <Card className="rounded-[2rem] border-2 overflow-hidden">
                    <CardHeader className="bg-muted/30 pb-4">
                      <CardTitle className="text-lg">Account Preferences</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0 divide-y-2">
                      <div className="p-6 flex items-center justify-between hover:bg-muted/20 transition-colors cursor-pointer">
                        <div className="flex items-center gap-4">
                          <div className="bg-primary/10 p-3 rounded-2xl">
                            <Languages className="w-6 h-6 text-primary" />
                          </div>
                          <div>
                            <p className="font-bold">App Language</p>
                            <p className="text-sm text-muted-foreground">{LANGUAGES.find(l => l.code === userProfile?.preferredLanguage)?.name}</p>
                          </div>
                        </div>
                        <ChevronRight className="w-5 h-5 text-muted-foreground" />
                      </div>
                      <div className="p-6 flex items-center justify-between hover:bg-muted/20 transition-colors cursor-pointer">
                        <div className="flex items-center gap-4">
                          <div className="bg-primary/10 p-3 rounded-2xl">
                            <MapPin className="w-6 h-6 text-primary" />
                          </div>
                          <div>
                            <p className="font-bold">Location Access</p>
                            <p className="text-sm text-muted-foreground">{location ? 'Enabled' : 'Disabled'}</p>
                          </div>
                        </div>
                        <ChevronRight className="w-5 h-5 text-muted-foreground" />
                      </div>
                      <div className="p-6 flex items-center justify-between hover:bg-muted/20 transition-colors cursor-pointer">
                        <div className="flex items-center gap-4">
                          <div className="bg-primary/10 p-3 rounded-2xl">
                            <Bot className="w-6 h-6 text-primary" />
                          </div>
                          <div>
                            <p className="font-bold">AI Personality</p>
                            <p className="text-sm text-muted-foreground">Village Neighbor (Default)</p>
                          </div>
                        </div>
                        <ChevronRight className="w-5 h-5 text-muted-foreground" />
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="rounded-[2rem] border-2 overflow-hidden">
                    <CardHeader className="bg-muted/30 pb-4">
                      <CardTitle className="text-lg">Security & Privacy</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0 divide-y-2">
                      <div className="p-6 flex items-center justify-between hover:bg-muted/20 transition-colors cursor-pointer">
                        <div className="flex items-center gap-4">
                          <div className="bg-blue-500/10 p-3 rounded-2xl">
                            <User className="w-6 h-6 text-blue-500" />
                          </div>
                          <div>
                            <p className="font-bold">Personal Information</p>
                            <p className="text-sm text-muted-foreground">Manage your profile data</p>
                          </div>
                        </div>
                        <ChevronRight className="w-5 h-5 text-muted-foreground" />
                      </div>
                    </CardContent>
                  </Card>

                  <div className="pt-4">
                    <Button variant="ghost" className="w-full justify-start gap-4 text-destructive hover:text-destructive hover:bg-destructive/10 rounded-2xl h-14 px-6" onClick={logout}>
                      <LogOut className="w-6 h-6" />
                      <span className="text-lg font-bold">Sign Out of AgroSave</span>
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Mobile Tab Bar */}
          <nav className="md:hidden bg-card border-t flex justify-around p-2 pb-8 shadow-2xl">
            {[
              { id: 'home', icon: HomeIcon, label: 'Home' },
              { id: 'advisor', icon: Bot, label: 'AI' },
              { id: 'farm', icon: LayoutDashboard, label: 'Farm' },
              { id: 'planner', icon: ClipboardList, label: 'Plan' },
              { id: 'weather', icon: CloudSun, label: 'Weather' },
            ].map((item) => (
              <button
                key={item.id}
                className={`flex flex-col items-center gap-1.5 p-2.5 flex-1 transition-all ${activeTab === item.id ? 'text-primary scale-110' : 'text-muted-foreground'}`}
                onClick={() => setActiveTab(item.id)}
              >
                <item.icon className={`w-6 h-6 ${activeTab === item.id ? 'fill-primary/10' : ''}`} />
                <span className="text-[10px] font-bold uppercase tracking-widest">{item.label}</span>
              </button>
            ))}
          </nav>

          {/* Camera Overlay */}
          {showCamera && (
            <div className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center p-4">
              <video ref={videoRef} autoPlay playsInline className="w-full max-w-md rounded-2xl border-2 border-white/20" />
              <div className="flex gap-6 mt-8">
                <Button variant="outline" className="rounded-full w-16 h-16 border-white/20 bg-white/10 text-white" onClick={stopCamera}><X className="w-8 h-8" /></Button>
                <Button className="rounded-full w-20 h-20 bg-white text-black" onClick={capturePhoto}><div className="w-16 h-16 rounded-full border-4 border-black/10" /></Button>
              </div>
              <canvas ref={canvasRef} className="hidden" />
            </div>
          )}
        </main>
      </div>
    </TooltipProvider>
  );
}
