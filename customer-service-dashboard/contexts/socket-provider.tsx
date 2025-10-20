"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/contexts/auth-context"// 👈 import your auth context

interface SocketContextValue {
  socket: Socket | null;
  isConnected: boolean;
}

const SocketContext = createContext<SocketContextValue>({
  socket: null,
  isConnected: false,
});

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const { toast } = useToast();
  const { user , fetchCurrentUser} = useAuth(); // 👈 get current user

  useEffect(() => {
    fetchCurrentUser();
  }, []);

  useEffect(() => {
    // Wait until user info is loaded
    if (!user) return;
  
    const API_BASE = process.env.NEXT_PUBLIC_API_BASE as string
    if (!API_BASE) return;
    const s = io(API_BASE, {
      path: "/socket.io",
      transports: ["websocket"],
      reconnection: true,
    });
  
    setSocket(s);
  
    s.on("connect", () => {
      console.log("✅ Connected to Socket.IO server");
      setIsConnected(true);
    });
  
    s.on("disconnect", (reason) => {
      if (user.role_id === 1) return; // ✅ Only skip for SUPERADMIN
      console.warn("❌ Disconnected from server:", reason);
      setIsConnected(false);    
    });
  
    s.on("wa:logout", (payload) => {
      if (user.role_id === 1) return; // ✅ Only skip for SUPERADMIN
      console.warn("⚠️ WhatsApp Session Logged Out:", payload);
      toast({
        title: "WhatsApp Session Logged Out",
        description: `Account ${payload.displayName || payload.accountId} has been logged out.`,
        variant: "destructive",
        duration: 99999999999,
      });
    });
  
    return () => {
      console.log("🧹 Cleaning up socket connection");
      s.disconnect();
    };
  }, [user, toast]); // ✅ include user here!
  

  return (
    <SocketContext.Provider value={{ socket, isConnected }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => useContext(SocketContext);
