import React, { createContext, useContext, useState } from 'react';

const ActiveCompanyContext = createContext();

export const ActiveCompanyProvider = ({ children }) => {
    const [activeCompany, setActiveCompany] = useState(null);

    return (
        <ActiveCompanyContext.Provider value={{ activeCompany, setActiveCompany }}>
            {children}
        </ActiveCompanyContext.Provider>
    );
};

export const useActiveCompany = () => useContext(ActiveCompanyContext);