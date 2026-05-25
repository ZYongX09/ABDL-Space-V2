import { createContext, useContext, useState, useCallback } from 'react';

const MobileHeaderContext = createContext(null);

export function MobileHeaderProvider({ children }) {
  const [actions, setActions] = useState([]);
  const [leftActions, setLeftActions] = useState([]);

  const registerActions = useCallback((newActions = [], newLeftActions = []) => {
    setActions(newActions);
    setLeftActions(newLeftActions);
  }, []);

  const clearActions = useCallback(() => {
    setActions([]);
    setLeftActions([]);
  }, []);

  return (
    <MobileHeaderContext.Provider value={{ actions, leftActions, registerActions, clearActions }}>
      {children}
    </MobileHeaderContext.Provider>
  );
}

export function useMobileHeaderActions() {
  const ctx = useContext(MobileHeaderContext);
  if (!ctx) throw new Error('useMobileHeaderActions must be used within MobileHeaderProvider');
  return ctx;
}
