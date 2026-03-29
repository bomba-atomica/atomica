import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext, useState, useEffect } from "react";
import { ethers } from "ethers";
export const WalletContext = createContext({
    account: null,
    connect: async () => { },
});
export function WalletProvider({ children }) {
    const [account, setAccount] = useState(null);
    const connect = async () => {
        if (window.ethereum) {
            try {
                const provider = new ethers.BrowserProvider(window.ethereum);
                const signer = await provider.getSigner();
                setAccount(await signer.getAddress());
            }
            catch (error) {
                console.error("Error connecting wallet:", error);
            }
        }
        else {
            alert("Please install MetaMask!");
        }
    };
    useEffect(() => {
        const checkConnection = async () => {
            if (window.ethereum) {
                const provider = new ethers.BrowserProvider(window.ethereum);
                const accounts = await provider.listAccounts();
                if (accounts.length > 0)
                    setAccount(accounts[0].address);
            }
        };
        checkConnection();
    }, []);
    return (_jsx(WalletContext.Provider, { value: { account, connect }, children: children }));
}
export const useWallet = () => useContext(WalletContext);
//# sourceMappingURL=WalletContext.js.map