declare module "@heroicons/react/24/solid" {
  import { FC, SVGProps } from "react";

  export const ChevronDownIcon: FC<SVGProps<SVGSVGElement>>;
  export const XCircleIcon: FC<SVGProps<SVGSVGElement>>;
  export const CheckCircleIcon: FC<SVGProps<SVGSVGElement>>;
}

interface EthereumProvider {
  isMetaMask?: boolean;
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on(event: string, handler: (...args: unknown[]) => void): void;
  removeListener(event: string, handler: (...args: unknown[]) => void): void;
  chainId: string;
  selectedAddress: string | null;
}

interface Window {
  ethereum?: EthereumProvider;
}
