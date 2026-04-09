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
  Plus
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

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
  size: string;
  location: string;
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
  const [activeTab, setActiveTab] = useState('advisor');
  const [location, setLocation] = useState<{lat: number, lng: number} | null>(null);
  
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
    try {
      await signInWithGoogle();
    } catch (err) {
      console.error(err);
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
        <h1 className="text-3xl font-bold tracking-tighter">AgroAdvisor</h1>
        <p className="mt-2 opacity-80">Loading your farm assistant...</p>
      </div>
    );
  }

  // Auth Screen
  if (!user) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        <div className="bg-primary/10 p-6 rounded-3xl mb-8">
          <Sprout className="w-20 h-20 text-primary" />
        </div>
        <h1 className="text-4xl font-bold tracking-tight mb-4">Welcome to AgroAdvisor</h1>
        <p className="text-muted-foreground mb-12 max-w-sm">
          Join thousands of farmers across West Africa getting expert advice to grow better crops.
        </p>
        <Button size="lg" onClick={handleLogin} className="w-full max-w-xs gap-3 py-6 text-lg rounded-2xl">
          <img src="https://www.google.com/favicon.ico" className="w-5 h-5" alt="Google" />
          Continue with Google
        </Button>
      </div>
    );
  }

  // Onboarding Screen
  if (!userProfile?.onboardingCompleted) {
    return (
      <div className="min-h-screen bg-background p-6 flex flex-col items-center justify-center">
        <div className="w-full max-w-md">
          <div className="flex justify-between mb-8">
            {[0, 1].map((s) => (
              <div key={s} className={`h-2 flex-1 rounded-full mx-1 ${onboardingStep >= s ? 'bg-primary' : 'bg-muted'}`} />
            ))}
          </div>

          <AnimatePresence mode="wait">
            {onboardingStep === 0 ? (
              <motion.div 
                key="step0"
                initial={{ x: 20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -20, opacity: 0 }}
                className="space-y-6"
              >
                <h2 className="text-3xl font-bold">Choose your language</h2>
                <p className="text-muted-foreground">Which language do you prefer for agricultural advice?</p>
                <div className="grid grid-cols-2 gap-3">
                  {LANGUAGES.map(lang => (
                    <Button 
                      key={lang.code} 
                      variant="outline" 
                      className="h-16 text-lg rounded-2xl"
                      onClick={() => {
                        handleOnboardingComplete({ language: lang.code });
                      }}
                    >
                      {lang.name}
                    </Button>
                  ))}
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background flex flex-col md:flex-row font-sans text-foreground">
        
        {/* Desktop Sidebar */}
        <aside className="hidden md:flex flex-col w-64 border-r bg-card p-6 gap-8">
          <div className="flex items-center gap-3">
            <div className="bg-primary p-2 rounded-xl">
              <Sprout className="text-primary-foreground w-6 h-6" />
            </div>
            <h1 className="font-bold text-xl tracking-tight">AgroAdvisor</h1>
          </div>

          <nav className="flex-1 flex flex-col gap-2">
            {[
              { id: 'advisor', icon: Bot, label: 'AI Advisor' },
              { id: 'farm', icon: LayoutDashboard, label: 'My Farm' },
              { id: 'weather', icon: CloudSun, label: 'Weather' },
              { id: 'settings', icon: Settings, label: 'Settings' },
            ].map((item) => (
              <Button
                key={item.id}
                variant={activeTab === item.id ? 'default' : 'ghost'}
                className="justify-start gap-3 h-12 rounded-xl text-base"
                onClick={() => setActiveTab(item.id)}
              >
                <item.icon className="w-5 h-5" />
                {item.label}
              </Button>
            ))}
          </nav>

          <div className="pt-6 border-t">
            <div className="flex items-center gap-3 mb-4">
              <Avatar className="w-10 h-10 border-2 border-primary">
                <AvatarImage src={user.photoURL || ''} />
                <AvatarFallback>{user.displayName?.[0]}</AvatarFallback>
              </Avatar>
              <div className="flex-1 overflow-hidden">
                <p className="font-bold text-sm truncate">{user.displayName}</p>
                <p className="text-xs text-muted-foreground truncate">{user.email}</p>
              </div>
            </div>
            <Button variant="ghost" className="w-full justify-start gap-3 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={logout}>
              <LogOut className="w-5 h-5" />
              Logout
            </Button>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 flex flex-col h-screen overflow-hidden relative">
          
          {/* Mobile Header */}
          <header className="md:hidden sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sprout className="text-primary w-6 h-6" />
              <h1 className="font-bold text-lg">AgroAdvisor</h1>
            </div>
            <Avatar className="w-8 h-8 border border-primary">
              <AvatarImage src={user.photoURL || ''} />
              <AvatarFallback>{user.displayName?.[0]}</AvatarFallback>
            </Avatar>
          </header>

          <div className="flex-1 overflow-hidden p-4 md:p-8">
            {activeTab === 'advisor' && (
              <div className="h-full flex flex-col max-w-3xl mx-auto gap-4">
                <ScrollArea className="flex-1 pr-4" ref={scrollRef}>
                  <div className="flex flex-col gap-6 pb-4">
                    {messages.map((m) => (
                      <div key={m.id} className={`flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
                        <Avatar className={`w-10 h-10 border-2 ${m.role === 'user' ? 'border-accent' : 'border-primary'}`}>
                          <AvatarFallback className={m.role === 'user' ? 'bg-accent text-accent-foreground' : 'bg-primary text-primary-foreground'}>
                            {m.role === 'user' ? <User className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
                          </AvatarFallback>
                        </Avatar>
                        <div className={`flex flex-col gap-1 max-w-[85%] ${m.role === 'user' ? 'items-end' : ''}`}>
                          <div className={`p-4 rounded-2xl shadow-sm ${m.role === 'user' ? 'bg-accent text-accent-foreground rounded-tr-none' : 'bg-card border rounded-tl-none'}`}>
                            {m.image && <img src={m.image} className="rounded-lg mb-3 max-w-full border" alt="Crop" />}
                            <div className="prose prose-sm max-w-none">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                    {isLoading && (
                      <div className="flex gap-3">
                        <Avatar className="w-10 h-10 border-2 border-primary"><AvatarFallback className="bg-primary"><Bot className="w-5 h-5 text-white" /></AvatarFallback></Avatar>
                        <div className="bg-card border p-4 rounded-2xl rounded-tl-none flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin text-primary" /><span className="text-sm italic text-muted-foreground">Thinking...</span></div>
                      </div>
                    )}
                  </div>
                </ScrollArea>

                <div className="flex flex-col gap-3 pt-2">
                  {capturedImage && (
                    <div className="relative w-20 h-20"><img src={capturedImage} className="w-full h-full object-cover rounded-lg border-2 border-primary" alt="Preview" /><button onClick={() => setCapturedImage(null)} className="absolute -top-2 -right-2 bg-destructive text-white rounded-full p-1"><X className="w-3 h-3" /></button></div>
                  )}
                  <div className="flex items-center gap-2 bg-card border p-2 rounded-2xl shadow-lg">
                    <Button variant="ghost" size="icon" onClick={startCamera}><Camera className="w-5 h-5" /></Button>
                    <Input placeholder="Ask AgroAdvisor..." value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSend()} className="border-none focus-visible:ring-0 bg-transparent" />
                    <Button variant="ghost" size="icon" onClick={startListening} className={isListening ? 'text-red-500 animate-pulse' : ''}><Mic className="w-5 h-5" /></Button>
                    <Button onClick={handleSend} disabled={(!input.trim() && !capturedImage) || isLoading}><Send className="w-4 h-4" /></Button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'farm' && (
              <div className="max-w-4xl mx-auto space-y-8">
                <div className="flex justify-between items-center">
                  <h2 className="text-3xl font-bold">My Farm Records</h2>
                  <Dialog>
                    <DialogTrigger><Button className="gap-2 rounded-xl"><Plus className="w-4 h-4" /> Add Farm</Button></DialogTrigger>
                    <DialogContent>
                      <DialogHeader><DialogTitle>Add New Farm Record</DialogTitle></DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2"><label className="text-sm font-medium">Farm Name</label><Input placeholder="e.g. North Field" id="farmName" /></div>
                        <div className="space-y-2"><label className="text-sm font-medium">Crop Type</label><Input placeholder="e.g. Maize" id="cropType" /></div>
                        <Button className="w-full" onClick={async () => {
                          const name = (document.getElementById('farmName') as HTMLInputElement).value;
                          const crop = (document.getElementById('cropType') as HTMLInputElement).value;
                          if (name && crop && user) {
                            await addDoc(collection(db, 'users', user.uid, 'farms'), {
                              name, cropType: crop, size: 'Small', location: location?.lat ? `${location.lat}, ${location.lng}` : 'Unknown', createdAt: serverTimestamp()
                            });
                          }
                        }}>Save Farm</Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {farms.length === 0 ? (
                    <div className="col-span-full py-20 text-center border-2 border-dashed rounded-3xl">
                      <Sprout className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                      <p className="text-lg font-medium">No farm records yet</p>
                      <p className="text-muted-foreground">Add your first farm to track its progress.</p>
                    </div>
                  ) : (
                    farms.map(farm => (
                      <Card key={farm.id} className="rounded-3xl overflow-hidden border-2 hover:border-primary/50 transition-colors">
                        <CardHeader className="bg-primary/5 pb-4">
                          <div className="flex justify-between items-start">
                            <Badge variant="secondary" className="bg-primary/10 text-primary border-none">{farm.cropType}</Badge>
                            <Sprout className="text-primary w-5 h-5" />
                          </div>
                          <CardTitle className="text-xl mt-2">{farm.name}</CardTitle>
                        </CardHeader>
                        <CardContent className="p-6 space-y-4">
                          <div className="flex items-center gap-3 text-sm">
                            <MapPin className="w-4 h-4 text-muted-foreground" />
                            <span>{farm.location}</span>
                          </div>
                          <div className="flex items-center gap-3 text-sm">
                            <CheckCircle2 className="w-4 h-4 text-green-500" />
                            <span>Healthy Growth Reported</span>
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  )}
                </div>
              </div>
            )}

            {activeTab === 'weather' && (
              <div className="max-w-3xl mx-auto space-y-6">
                <h2 className="text-3xl font-bold">Weather & Alerts</h2>
                <Card className="rounded-3xl bg-primary text-primary-foreground p-8">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-lg opacity-80">Current Weather</p>
                      <h3 className="text-5xl font-bold mt-2">32°C</h3>
                      <p className="text-xl mt-2">Sunny - Lagos, NG</p>
                    </div>
                    <CloudSun className="w-24 h-24" />
                  </div>
                </Card>
                <div className="space-y-4">
                  <h3 className="text-xl font-bold">Local Alerts</h3>
                  <div className="bg-accent/10 border-l-4 border-accent p-4 rounded-r-2xl flex gap-4">
                    <AlertTriangle className="text-accent w-6 h-6 shrink-0" />
                    <div>
                      <p className="font-bold">Armyworm Warning</p>
                      <p className="text-sm opacity-80">Increased reports of Fall Armyworm in neighboring districts. Inspect your maize crops daily.</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'settings' && (
              <div className="max-w-2xl mx-auto space-y-8">
                <h2 className="text-3xl font-bold">Settings</h2>
                <div className="space-y-4">
                  <Card className="rounded-2xl">
                    <CardContent className="p-6 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <Languages className="w-6 h-6 text-primary" />
                        <div>
                          <p className="font-bold">App Language</p>
                          <p className="text-sm text-muted-foreground">{LANGUAGES.find(l => l.code === userProfile?.preferredLanguage)?.name}</p>
                        </div>
                      </div>
                      <Button variant="outline">Change</Button>
                    </CardContent>
                  </Card>
                  <Card className="rounded-2xl">
                    <CardContent className="p-6 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <MapPin className="w-6 h-6 text-primary" />
                        <div>
                          <p className="font-bold">Location Access</p>
                          <p className="text-sm text-muted-foreground">{location ? 'Enabled' : 'Disabled'}</p>
                        </div>
                      </div>
                      <Button variant="outline">Update</Button>
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}
          </div>

          {/* Mobile Tab Bar */}
          <nav className="md:hidden bg-card border-t flex justify-around p-2 pb-6">
            {[
              { id: 'advisor', icon: Bot, label: 'Advisor' },
              { id: 'farm', icon: LayoutDashboard, label: 'Farm' },
              { id: 'weather', icon: CloudSun, label: 'Weather' },
              { id: 'settings', icon: Settings, label: 'Settings' },
            ].map((item) => (
              <button
                key={item.id}
                className={`flex flex-col items-center gap-1 p-2 flex-1 ${activeTab === item.id ? 'text-primary' : 'text-muted-foreground'}`}
                onClick={() => setActiveTab(item.id)}
              >
                <item.icon className="w-6 h-6" />
                <span className="text-[10px] font-bold uppercase tracking-wider">{item.label}</span>
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
