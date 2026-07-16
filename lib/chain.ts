import {
  createPublicClient,
  createWalletClient,
  http,
  type PublicClient,
  type WalletClient,
  type Chain,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monad, monadTestnet } from "viem/chains";

/** Argus targets Monad. Testnet (10143) is the default; set ARGUS_CHAIN_ID=143 for mainnet. */
export function chainId(): number {
  const n = parseInt(process.env.ARGUS_CHAIN_ID || "10143", 10);
  return n === 143 ? 143 : 10143;
}

export function chain(): Chain {
  return chainId() === 143 ? monad : monadTestnet;
}

export function chainName(): string {
  return chainId() === 143 ? "Monad" : "Monad testnet";
}

export function rpcUrl(): string {
  return process.env.MONAD_RPC_URL || chain().rpcUrls.default.http[0];
}

export function explorerUrl(): string {
  return (
    chain().blockExplorers?.default?.url ||
    (chainId() === 143
      ? "https://monadexplorer.com"
      : "https://testnet.monadexplorer.com")
  );
}

export function txUrl(hash: string): string {
  return `${explorerUrl()}/tx/${hash}`;
}

export function addressUrl(address: string): string {
  return `${explorerUrl()}/address/${address}`;
}

let _public: PublicClient | undefined;

/** Shared read-only client against Monad. */
export function publicClient(): PublicClient {
  if (!_public) {
    _public = createPublicClient({ chain: chain(), transport: http(rpcUrl()) });
  }
  return _public;
}

/** The registry contract address, if deployed/configured. */
export function registryAddress(): `0x${string}` | undefined {
  const a = (process.env.ARGUS_REGISTRY_ADDRESS || "").trim();
  return /^0x[0-9a-fA-F]{40}$/.test(a) ? (a as `0x${string}`) : undefined;
}

/** Backend attester wallet — the key that writes attestations onchain. */
export function walletClient(): WalletClient | undefined {
  const key = (process.env.ARGUS_SIGNER_KEY || "").trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) return undefined;
  const account = privateKeyToAccount(key as `0x${string}`);
  return createWalletClient({
    account,
    chain: chain(),
    transport: http(rpcUrl()),
  });
}

/** True when the app can write attestations (registry + signer configured). */
export function canAttest(): boolean {
  return Boolean(registryAddress()) && Boolean(walletClient());
}
