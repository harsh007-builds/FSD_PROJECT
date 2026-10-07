import React, { createContext, useContext, useEffect, useState } from 'react';
import { socketService } from '../services/socket';
import { useUser } from './UserContext';

const SocketContext = createContext();

export const SocketProvider = ({ children }) => {
  const { user } = useUser();
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (user) {
      const token = localStorage.getItem('token');
      socketService.connect(token);

      const handleConnect = () => setIsConnected(true);
      const handleDisconnect = () => setIsConnected(false);

      socketService.on('connect', handleConnect);
      socketService.on('disconnect', handleDisconnect);

      setIsConnected(socketService.connected);

      return () => {
        socketService.off('connect', handleConnect);
        socketService.off('disconnect', handleDisconnect);
        socketService.disconnect();
      };
    }
  }, [user]);

  return (
    <SocketContext.Provider value={{ socketService, isConnected }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => {
  return useContext(SocketContext);
};
