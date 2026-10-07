import React from 'react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

const MainLayout = ({ children, onViewChange, activeTab, onTabChange, isLoggedIn }) => {
  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-white font-sans selection:bg-blue-500/30 selection:text-blue-200">
      <Navbar 
        onViewChange={onViewChange} 
        activeTab={activeTab} 
        onTabChange={onTabChange}
        isLoggedIn={isLoggedIn}
      />
      <main className="flex-grow flex flex-col">
        {children}
      </main>
      {!isLoggedIn && <Footer />}
    </div>
  );
};

export default MainLayout;
